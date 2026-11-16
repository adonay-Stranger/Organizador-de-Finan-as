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
const fmtTamanho = (b) => (b >= 1024 * 1024 ? (b / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB");
const pct = (a, b) => (b > 0 ? (a / b) * 100 : 0);
const hoje = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const centavosParaTexto = (c) => (c ? (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "");
const ICONE_CLIPE = `<svg class="ic-clipe" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5l-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l9-9a3.7 3.7 0 0 1 5.2 5.2l-9 9a1.8 1.8 0 0 1-2.6-2.6l8.3-8.3"/></svg>`;

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
  toastTimer = setTimeout(() => t.classList.remove("on"), 3000);
}

function baixarArquivo(nome, conteudo, tipo) {
  const blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function dataURLParaBlob(dataURL) {
  const [cab, b64] = dataURL.split(",");
  const tipo = (cab.match(/data:([^;]+)/) || [])[1] || "application/octet-stream";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: tipo });
}

// ---------- comprovantes: preparo do arquivo ----------
// Fotos são reduzidas e convertidas em JPEG para caber no banco de dados
// (limite de ~1 MB por comprovante). PDFs vão como estão, até 700 KB.
function lerDataURL(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(file); });
}
function carregarImagem(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("Não consegui abrir essa imagem. Tente uma foto em JPG ou PNG.")); };
    img.src = url;
  });
}
async function prepararArquivo(file) {
  const id = novoId();
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    if (file.size > 700 * 1024) throw new Error("O PDF tem mais de 700 KB. Tire uma foto ou um print do comprovante e anexe a imagem.");
    return { id, nome: file.name, tipo: "application/pdf", tamanho: file.size, dados: await lerDataURL(file) };
  }
  if (!file.type.startsWith("image/") && !/\.(jpe?g|png|webp|heic|heif|gif)$/i.test(file.name)) {
    throw new Error("Anexe uma foto (JPG ou PNG) ou um PDF.");
  }
  const img = await carregarImagem(file);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  for (const [max, q] of [[1600, 0.75], [1280, 0.65], [1000, 0.55], [800, 0.5]]) {
    const escala = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    canvas.width = Math.round(img.naturalWidth * escala);
    canvas.height = Math.round(img.naturalHeight * escala);
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dados = canvas.toDataURL("image/jpeg", q);
    if (dados.length < 900000) {
      const base = (file.name || "comprovante").replace(/\.[^.]+$/, "") || "comprovante";
      return { id, nome: base + ".jpg", tipo: "image/jpeg", tamanho: Math.round(dados.length * 0.75), dados };
    }
  }
  throw new Error("A imagem é grande demais, mesmo reduzida. Tente um print da tela.");
}

// ---------- estado ----------
let store;
let S = { config: null, gastos: [] };
const filtro = { busca: "", mes: "", categoria: "", fonte: "", situacao: "" };
const rel = { periodo: "tudo", de: "", ate: "", categoria: "", fonte: "" };

const cats = () => S.config.categorias || [];
const fontes = () => S.config.fontes || [];
const nomeCat = (id) => cats().find((c) => c.id === id)?.nome || "Sem categoria";
const nomeFonte = (id) => fontes().find((f) => f.id === id)?.nome || "Sem origem";
const somar = (lista) => lista.reduce((t, x) => t + (x.valor || 0), 0);
const pagoDe = (g) => somar(g.pagamentos || []);
const faltaDe = (g) => Math.max(0, (g.valor || 0) - pagoDe(g));
const situacaoDe = (g) => { const p = pagoDe(g); return p >= (g.valor || 0) ? "pago" : p > 0 ? "parcial" : "aberto"; };
const pagamentosDe = (lista) => lista.flatMap((g) => (g.pagamentos || []).map((p) => ({ ...p, gasto: g })));
const temComprovante = (g) => (g.pagamentos || []).some((p) => p.comprovante);
function agrupar(lista, chave) {
  const m = new Map();
  for (const x of lista) { const k = chave(x); m.set(k, (m.get(k) || 0) + (x.valor || 0)); }
  return [...m].sort((a, b) => b[1] - a[1]);
}
const porData = (a, b) => (b.data || "").localeCompare(a.data || "");
const ordenar = (lista) => [...lista].sort((a, b) => porData(a, b) || String(b.criadoEm || "").localeCompare(String(a.criadoEm || "")));
const autor = () => store.state.user?.email || "";

// ---------- componentes ----------
function barras(itens, total) {
  if (!itens.length) return `<p class="vazio-pequeno">Nenhum pagamento registrado ainda.</p>`;
  const max = Math.max(...itens.map((i) => i[1]));
  return `<ul class="barras">${itens.map(([nome, v]) => `
    <li>
      <div class="barras-txt"><span>${esc(nome)}</span><span class="num">${money(v)} <small>${fmtPct(pct(v, total))}</small></span></div>
      <div class="barras-trilho"><span style="width:${max ? (v / max) * 100 : 0}%"></span></div>
    </li>`).join("")}</ul>`;
}

function seloSituacao(g) {
  const s = situacaoDe(g);
  if (s === "pago") return `<span class="selo pago">Pago</span>`;
  if (s === "parcial") return `<span class="selo parcial">Falta ${money(faltaDe(g))}</span>`;
  return `<span class="selo aberto">A pagar</span>`;
}

function itemGasto(g) {
  const origens = [...new Set((g.pagamentos || []).map((p) => nomeFonte(p.fonte)))];
  return `<li><button type="button" class="gasto" data-editar="${esc(g.id)}">
    <span class="gasto-info">
      <span class="gasto-desc">${esc(g.descricao || nomeCat(g.categoria))}</span>
      <span class="gasto-meta">${fmtData(g.data)} · ${esc(nomeCat(g.categoria))}${origens.length ? " · " + esc(origens.join(", ")) : ""}</span>
    </span>
    <span class="gasto-dir">
      <span class="gasto-valor num">${temComprovante(g) ? ICONE_CLIPE : ""}${money(g.valor)}</span>
      ${seloSituacao(g)}
    </span>
  </button></li>`;
}

const listaGastos = (lista) => `<ul class="lista-gastos">${lista.map(itemGasto).join("")}</ul>`;

// ---------- telas ----------
function telaInicio() {
  const pagos = pagamentosDe(S.gastos);
  const totalPago = somar(pagos);
  const aPagar = S.gastos.reduce((t, g) => t + faltaDe(g), 0);
  const comprometido = totalPago + aPagar;
  const meta = S.config.meta || 0;
  const mes = hoje().slice(0, 7);
  const pagoMes = somar(pagos.filter((p) => (p.data || "").startsWith(mes)));
  const emAberto = S.gastos.filter((g) => faltaDe(g) > 0);
  const vazio = !S.gastos.length;

  let blocoMeta;
  if (meta) {
    const pP = Math.min(pct(totalPago, meta), 100);
    const pA = Math.min(pct(aPagar, meta), 100 - pP);
    const livre = meta - comprometido;
    blocoMeta = `
      <div class="barra-meta ${comprometido > meta ? "estourou" : ""}" role="img" aria-label="${fmtPct(pct(totalPago, meta))} da meta já pago">
        <span class="seg-pago" style="width:${pP}%"></span><span class="seg-apagar" style="width:${pA}%"></span>
      </div>
      <div class="meta-linha"><span>${fmtPct(pct(totalPago, meta))} da meta já pago</span><span>Meta ${money(meta)}</span></div>
      <ul class="legenda">
        <li><i class="lg-pago"></i>Pago <strong class="num">${money(totalPago)}</strong></li>
        ${aPagar ? `<li><i class="lg-apagar"></i>A pagar <strong class="num">${money(aPagar)}</strong></li>` : ""}
      </ul>
      <p class="falta">${livre >= 0
        ? `Sobram <strong>${money(livre)}</strong> da meta para novos gastos.`
        : `Os gastos lançados passam <strong>${money(-livre)}</strong> da meta.`}</p>`;
  } else {
    blocoMeta = `${aPagar ? `<p class="falta">Falta pagar <strong>${money(aPagar)}</strong> de gastos já lançados.</p>` : ""}
      <p class="falta">Defina o valor final previsto para a obra em <a href="#ajustes">Ajustes</a> para acompanhar quanto falta.</p>`;
  }

  const usoFontes = fontes().map((f) => ({ ...f, gasto: somar(pagos.filter((p) => p.fonte === f.id)) }));
  const semFonte = somar(pagos.filter((p) => !fontes().some((f) => f.id === p.fonte)));
  if (semFonte) usoFontes.push({ id: "", nome: "Sem origem", valor: 0, gasto: semFonte });
  const fontesHtml = usoFontes.filter((f) => f.gasto || f.valor).map((f) => {
    const saldo = f.valor - f.gasto;
    return `<li class="fonte">
      <div class="fonte-topo"><span class="fonte-nome">${esc(f.nome)}</span><span class="num">${money(f.gasto)}</span></div>
      ${f.valor > 0 ? `
        <div class="barras-trilho ${f.gasto > f.valor ? "estourou" : ""}"><span style="width:${Math.min(pct(f.gasto, f.valor), 100)}%"></span></div>
        <p class="fonte-saldo">${saldo >= 0 ? `Sobram ${money(saldo)} de ${money(f.valor)}` : `Passou ${money(-saldo)} do previsto (${money(f.valor)})`}</p>`
        : `<p class="fonte-saldo">${fmtPct(pct(f.gasto, totalPago))} do total pago</p>`}
    </li>`;
  }).join("");

  return `
  <section class="painel-meta">
    <p class="rotulo">Total já pago</p>
    <p class="valor-grande num">${money(totalPago)}</p>
    ${blocoMeta}
  </section>

  <div class="mini-grid">
    <div class="mini"><p class="rotulo">Pago em ${MESES_LONGOS[+mes.slice(5) - 1]}</p><p class="valor num">${money(pagoMes)}</p></div>
    <a class="mini" href="#gastos" data-ver-apagar><p class="rotulo">A pagar</p><p class="valor num">${money(aPagar)}</p><p class="mini-sub">${emAberto.length} ${emAberto.length === 1 ? "gasto" : "gastos"} em aberto</p></a>
  </div>

  ${vazio ? `
  <section class="vazio">
    <h2>Nenhum gasto lançado ainda</h2>
    <p>Toque no botão <strong>+</strong> para lançar o primeiro gasto. Registre quanto já foi pago, de onde saiu o dinheiro e anexe o comprovante.</p>
  </section>` : `
  ${emAberto.length ? `<section>
    <div class="sec-head"><h2>Contas a pagar</h2><a href="#gastos" data-ver-apagar>Ver todas</a></div>
    ${listaGastos([...emAberto].sort((a, b) => faltaDe(b) - faltaDe(a)).slice(0, 4))}
  </section>` : ""}
  <section>
    <h2>De onde saiu o dinheiro</h2>
    ${fontesHtml ? `<ul class="fontes">${fontesHtml}</ul>` : `<p class="vazio-pequeno">Nenhum pagamento registrado ainda.</p>`}
  </section>
  <section>
    <h2>Pago por categoria</h2>
    ${barras(agrupar(pagos, (p) => nomeCat(p.gasto.categoria)).slice(0, 6), totalPago)}
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
    (!filtro.fonte || (g.pagamentos || []).some((p) => p.fonte === filtro.fonte)) &&
    (!filtro.situacao || (filtro.situacao === "aberto" ? faltaDe(g) > 0 : situacaoDe(g) === filtro.situacao)) &&
    (!b || `${g.descricao} ${g.obs} ${nomeCat(g.categoria)} ${(g.pagamentos || []).map((p) => nomeFonte(p.fonte)).join(" ")}`.toLowerCase().includes(b)));
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
  const falta = lista.reduce((t, g) => t + faltaDe(g), 0);
  return `<p class="total-filtro">${lista.length} ${lista.length === 1 ? "gasto" : "gastos"} · <strong class="num">${money(somar(lista))}</strong>${falta ? ` · falta pagar <strong class="num">${money(falta)}</strong>` : ""}</p>` +
    [...porMes].map(([mes, gs]) => `
      <div class="grupo-mes">
        <div class="grupo-cab"><h3>${mes ? fmtMesLongo(mes) : "Sem data"}</h3><span class="num">${money(somar(gs))}</span></div>
        ${listaGastos(gs)}
      </div>`).join("");
}

function opcoes(lista, sel, todos) {
  return (todos != null ? `<option value="">${todos}</option>` : "") +
    lista.map((x) => `<option value="${esc(x.id)}" ${x.id === sel ? "selected" : ""}>${esc(x.nome)}</option>`).join("");
}

function telaGastos() {
  const meses = [...new Set(S.gastos.map((g) => (g.data || "").slice(0, 7)).filter(Boolean))].sort().reverse();
  return `
  <section class="filtros">
    <input id="f-busca" type="search" placeholder="Buscar descrição, loja…" value="${esc(filtro.busca)}" aria-label="Buscar">
    <div class="filtros-linha">
      <select id="f-situacao" aria-label="Situação">
        ${[["", "Pagos e a pagar"], ["aberto", "Só a pagar"], ["pago", "Só pagos"]].map(([v, n]) => `<option value="${v}" ${filtro.situacao === v ? "selected" : ""}>${n}</option>`).join("")}
      </select>
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
const noPeriodo = (data) => { const [de, ate] = intervaloRel(); return (!de || (data || "") >= de) && (!ate || (data || "") <= ate); };
// pagamentos feitos no período (filtro de origem vale para o pagamento)
const pagamentosRel = () => pagamentosDe(S.gastos.filter((g) => !rel.categoria || g.categoria === rel.categoria))
  .filter((p) => noPeriodo(p.data) && (!rel.fonte || p.fonte === rel.fonte)).sort(porData);
// gastos lançados no período
const gastosRel = () => ordenar(S.gastos.filter((g) => noPeriodo(g.data) &&
  (!rel.categoria || g.categoria === rel.categoria) && (!rel.fonte || (g.pagamentos || []).some((p) => p.fonte === rel.fonte))));

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
  if (!linhas.length) return `<p class="vazio-pequeno">Sem pagamentos no período.</p>`;
  return `<div class="tabela-wrap"><table class="tabela">
    <thead><tr><th>${cab}</th><th class="num">Valor</th><th class="num">%</th></tr></thead>
    <tbody>${linhas.map(([n, v]) => `<tr><td>${esc(n)}</td><td class="num">${money(v)}</td><td class="num">${fmtPct(pct(v, total))}</td></tr>`).join("")}</tbody>
    <tfoot><tr><td>Total</td><td class="num">${money(total)}</td><td class="num">100%</td></tr></tfoot>
  </table></div>`;
}

function documentoRelatorio() {
  const pags = pagamentosRel();
  const gastos = gastosRel();
  const totalPagoPeriodo = somar(pags);
  const totalPago = somar(pagamentosDe(S.gastos));
  const aPagar = S.gastos.reduce((t, g) => t + faltaDe(g), 0);
  const meta = S.config.meta || 0;
  const agora = new Date();
  const geradoEm = `${agora.toLocaleDateString("pt-BR")} às ${agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  const porMes = agrupar(pags, (p) => (p.data || "").slice(0, 7)).sort((a, b) => a[0].localeCompare(b[0])).map(([m, v]) => [m ? fmtMesLongo(m) : "Sem data", v]);
  const emAberto = ordenar(S.gastos.filter((g) => faltaDe(g) > 0 && (!rel.categoria || g.categoria === rel.categoria)));
  const comComp = pags.filter((p) => p.comprovante).length;

  return `<article id="doc-relatorio" class="relatorio">
    <header class="rel-cab">
      <p class="eyebrow">Relatório de gastos da obra</p>
      <h2>${esc(S.config.nome || "Minha Casa")}</h2>
      <p class="rel-sub">${esc(descricaoPeriodo())} · gerado em ${geradoEm}</p>
    </header>
    <dl class="rel-resumo">
      <div><dt>Pago no período</dt><dd class="num">${money(totalPagoPeriodo)}</dd></div>
      <div><dt>Pagamentos no período</dt><dd class="num">${pags.length} <small>(${comComp} com comprovante)</small></dd></div>
      <div><dt>Total pago na obra</dt><dd class="num">${money(totalPago)}</dd></div>
      <div><dt>A pagar (gastos lançados)</dt><dd class="num">${money(aPagar)}</dd></div>
      ${meta ? `
      <div><dt>Meta do valor final</dt><dd class="num">${money(meta)}</dd></div>
      <div><dt>Da meta já pago</dt><dd class="num">${fmtPct(pct(totalPago, meta))}</dd></div>
      <div><dt>${meta >= totalPago + aPagar ? "Livre na meta" : "Acima da meta"}</dt><dd class="num">${money(Math.abs(meta - totalPago - aPagar))}</dd></div>` : ""}
    </dl>
    <h3>Pago por categoria</h3>
    ${tabela(agrupar(pags, (p) => nomeCat(p.gasto.categoria)), totalPagoPeriodo, "Categoria")}
    <h3>Pago por origem do dinheiro</h3>
    ${tabela(agrupar(pags, (p) => nomeFonte(p.fonte)), totalPagoPeriodo, "Origem")}
    <h3>Pago por mês</h3>
    ${tabela(porMes, totalPagoPeriodo, "Mês")}

    <h3>Pagamentos efetuados</h3>
    ${pags.length ? `<div class="tabela-wrap"><table class="tabela tabela-lanc">
      <thead><tr><th>Data</th><th>Gasto</th><th>Origem</th><th>Comprovante</th><th class="num">Valor</th></tr></thead>
      <tbody>${pags.map((p) => `<tr>
        <td class="nowrap">${fmtData(p.data)}</td>
        <td>${esc(p.gasto.descricao || nomeCat(p.gasto.categoria))}<br><small>${esc(nomeCat(p.gasto.categoria))}</small></td>
        <td>${esc(nomeFonte(p.fonte))}</td>
        <td>${p.comprovante ? "Anexado" : "—"}</td>
        <td class="num nowrap">${money(p.valor)}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td colspan="4">Total pago</td><td class="num nowrap">${money(totalPagoPeriodo)}</td></tr></tfoot>
    </table></div>` : `<p class="vazio-pequeno">Nenhum pagamento neste período.</p>`}

    <h3>Gastos lançados no período</h3>
    ${gastos.length ? `<div class="tabela-wrap"><table class="tabela tabela-lanc">
      <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th class="num">Valor</th><th class="num">Pago</th><th class="num">Falta</th></tr></thead>
      <tbody>${gastos.map((g) => `<tr>
        <td class="nowrap">${fmtData(g.data)}</td>
        <td>${esc(g.descricao || "—")}${g.obs ? `<br><small>${esc(g.obs)}</small>` : ""}</td>
        <td>${esc(nomeCat(g.categoria))}</td>
        <td class="num nowrap">${money(g.valor)}</td>
        <td class="num nowrap">${money(pagoDe(g))}</td>
        <td class="num nowrap">${faltaDe(g) ? money(faltaDe(g)) : "—"}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td colspan="3">Total</td><td class="num nowrap">${money(somar(gastos))}</td><td class="num nowrap">${money(gastos.reduce((t, g) => t + pagoDe(g), 0))}</td><td class="num nowrap">${money(gastos.reduce((t, g) => t + faltaDe(g), 0))}</td></tr></tfoot>
    </table></div>` : `<p class="vazio-pequeno">Nenhum gasto lançado neste período.</p>`}

    <h3>Contas a pagar (hoje)</h3>
    ${emAberto.length ? `<div class="tabela-wrap"><table class="tabela">
      <thead><tr><th>Gasto</th><th class="num">Valor</th><th class="num">Falta pagar</th></tr></thead>
      <tbody>${emAberto.map((g) => `<tr><td>${esc(g.descricao || nomeCat(g.categoria))}<br><small>${fmtData(g.data)} · ${esc(nomeCat(g.categoria))}</small></td><td class="num nowrap">${money(g.valor)}</td><td class="num nowrap">${money(faltaDe(g))}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td colspan="2">Total a pagar</td><td class="num nowrap">${money(emAberto.reduce((t, g) => t + faltaDe(g), 0))}</td></tr></tfoot>
    </table></div>` : `<p class="vazio-pequeno">Nada a pagar. Todos os gastos estão quitados.</p>`}
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

function gerarCSV() {
  const cel = (v) => { const s = String(v ?? ""); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const n = (c) => centavosParaTexto(c) || "0,00";
  const pags = pagamentosRel();
  const gastos = gastosRel();
  const linhas = [
    [`Relatório da obra: ${S.config.nome || "Minha Casa"}`], [descricaoPeriodo()], [],
    ["PAGAMENTOS EFETUADOS"],
    ["Data", "Gasto", "Categoria", "Origem do dinheiro", "Valor (R$)", "Comprovante", "Lançado por"],
    ...pags.map((p) => [fmtData(p.data), p.gasto.descricao, nomeCat(p.gasto.categoria), nomeFonte(p.fonte), n(p.valor), p.comprovante ? "Sim" : "Não", p.gasto.criadoPor]),
    ["", "Total pago", "", "", n(somar(pags)), "", ""],
    [],
    ["GASTOS LANÇADOS"],
    ["Data", "Descrição", "Categoria", "Valor (R$)", "Pago (R$)", "Falta (R$)", "Situação", "Observação"],
    ...gastos.map((g) => [fmtData(g.data), g.descricao, nomeCat(g.categoria), n(g.valor), n(pagoDe(g)), n(faltaDe(g)),
      { pago: "Pago", parcial: "Pago em parte", aberto: "A pagar" }[situacaoDe(g)], g.obs]),
    ["", "Total", "", n(somar(gastos)), n(gastos.reduce((t, g) => t + pagoDe(g), 0)), n(gastos.reduce((t, g) => t + faltaDe(g), 0)), "", ""],
  ];
  return "﻿" + linhas.map((l) => l.map(cel).join(";")).join("\r\n");
}

function textoResumo() {
  const pags = pagamentosRel();
  const total = somar(pags);
  const meta = S.config.meta || 0;
  const totalPago = somar(pagamentosDe(S.gastos));
  const aPagar = S.gastos.reduce((t, g) => t + faltaDe(g), 0);
  const l = [`Obra: ${S.config.nome || "Minha Casa"}`, descricaoPeriodo(), "", `Pago no período: ${money(total)} (${pags.length} pagamentos)`];
  l.push(`Total pago na obra: ${money(totalPago)}${meta ? ` de ${money(meta)} (${fmtPct(pct(totalPago, meta))})` : ""}`);
  if (aPagar) l.push(`A pagar: ${money(aPagar)}`);
  l.push("", "Por origem do dinheiro:");
  for (const [nm, v] of agrupar(pags, (p) => nomeFonte(p.fonte))) l.push(`• ${nm}: ${money(v)}`);
  l.push("", "Por categoria:");
  for (const [nm, v] of agrupar(pags, (p) => nomeCat(p.gasto.categoria))) l.push(`• ${nm}: ${money(v)}`);
  return l.join("\n");
}

// ----- ajustes -----
function telaAjustes() {
  const usados = new Set(S.gastos.map((g) => g.categoria));
  const fontesUsadas = new Set(pagamentosDe(S.gastos).map((p) => p.fonte));
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
    <p class="ajuda">De onde sai o dinheiro de cada pagamento. O valor previsto é opcional: se preencher, o app mostra quanto ainda sobra em cada origem.</p>
    <form id="form-fontes" class="form-col">
      <ul class="edit-lista">
        ${fontes().map((f) => `<li data-fonte="${esc(f.id)}">
          <input class="ef-nome" value="${esc(f.nome)}" aria-label="Nome da origem" placeholder="Nome">
          <input class="ef-valor" inputmode="decimal" value="${esc(centavosParaTexto(f.valor))}" aria-label="Valor previsto de ${esc(f.nome)}" placeholder="Previsto (R$)">
          <button type="button" class="btn icone" data-remover-fonte="${esc(f.id)}" aria-label="Remover ${esc(f.nome)}" ${fontesUsadas.has(f.id) ? "disabled title=\"Em uso por algum pagamento\"" : ""}>✕</button>
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
    <p class="ajuda">Guarde uma cópia de todos os dados, inclusive os comprovantes, em um arquivo. Restaurar junta os dados do arquivo com os atuais, sem apagar nada.</p>
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

// ---------- formulário de gasto e pagamentos ----------
const dlg = $("#dlg-gasto");
let editando = null;      // gasto original (ou null se novo)
let pgs = [];             // pagamentos em edição: {id, valorTxt, data, fonte, comprovante}
let compNovos = new Map(); // comprovantes anexados e ainda não salvos: id -> arquivo

function lerPgsDoDom() {
  $("#pg-lista").querySelectorAll(".pg").forEach((li) => {
    const p = pgs[+li.dataset.i];
    if (!p) return;
    p.valorTxt = li.querySelector(".pg-valor").value;
    p.data = li.querySelector(".pg-data").value;
    p.fonte = li.querySelector(".pg-fonte").value;
  });
}

function atualizarResumoPg() {
  const total = parseValor($("#g-valor").value) || 0;
  const preenchidos = pgs.map((p) => parseValor(p.valorTxt)).filter((v) => v > 0);
  const vazios = pgs.filter((p) => !String(p.valorTxt || "").trim()).length;
  let pago = preenchidos.reduce((a, b) => a + b, 0);
  if (vazios === 1 && total > pago) pago = total; // o pagamento sem valor completa o total
  const falta = total - pago;
  const el = $("#pg-resumo");
  if (!pgs.length) { el.textContent = total ? `Nada pago ainda · falta ${money(total)}` : "Nada pago ainda"; el.className = "pg-resumo aberto"; return; }
  if (!total) { el.textContent = `Pago ${money(pago)}`; el.className = "pg-resumo"; return; }
  el.textContent = falta > 0 ? `Pago ${money(pago)} de ${money(total)} · falta ${money(falta)}`
    : falta < 0 ? `Os pagamentos passam ${money(-falta)} do valor do gasto` : `Pago por completo (${money(total)})`;
  el.className = "pg-resumo " + (falta > 0 ? "parcial" : falta < 0 ? "erro-txt" : "pago");
}

function renderPgs() {
  const total = parseValor($("#g-valor").value) || 0;
  const fontesOpc = fontes().length ? null : "Sem origem cadastrada";
  $("#pg-lista").innerHTML = pgs.map((p, i) => {
    const outros = pgs.reduce((t, q, j) => t + (j !== i ? parseValor(q.valorTxt) || 0 : 0), 0);
    const restante = total - outros;
    return `<li class="pg" data-i="${i}">
      <div class="pg-topo"><span class="pg-n">Pagamento ${i + 1}</span>
        <button type="button" class="btn icone" data-pg-remover="${i}" aria-label="Remover pagamento ${i + 1}">✕</button></div>
      <div class="linha2">
        <div><label for="pg-valor-${i}">Valor pago (R$)</label>
          <input id="pg-valor-${i}" class="pg-valor" inputmode="decimal" autocomplete="off" value="${esc(p.valorTxt)}" placeholder="${restante > 0 ? centavosParaTexto(restante) : "0,00"}"></div>
        <div><label for="pg-data-${i}">Data do pagamento</label>
          <input id="pg-data-${i}" class="pg-data" type="date" value="${esc(p.data)}"></div>
      </div>
      <label for="pg-fonte-${i}">Saiu de (origem do dinheiro)</label>
      <select id="pg-fonte-${i}" class="pg-fonte">${opcoes(fontes(), p.fonte, fontesOpc)}</select>
      <div class="pg-comp">${p.comprovante
        ? `<button type="button" class="anexo" data-pg-ver="${i}">${ICONE_CLIPE}<span class="anexo-nome">${esc(p.comprovante.nome)}</span><small>${fmtTamanho(p.comprovante.tamanho)}</small></button>
           <button type="button" class="btn link" data-pg-tirar="${i}">Remover</button>`
        : `<label class="btn anexar" for="pg-arq-${i}">${ICONE_CLIPE}Anexar comprovante</label>
           <input id="pg-arq-${i}" class="pg-arq" data-i="${i}" type="file" accept="image/*,application/pdf" hidden>`}</div>
    </li>`;
  }).join("");
  atualizarResumoPg();
}

function novoPagamento() {
  const ultima = pref.get("ultimaFonte", "");
  return { id: novoId(), valorTxt: "", data: hoje(), fonte: fontes().some((f) => f.id === ultima) ? ultima : fontes()[0]?.id || "", comprovante: null };
}

function abrirGasto(id) {
  const g = id ? S.gastos.find((x) => x.id === id) : null;
  editando = g || null;
  compNovos = new Map();
  $("#dlg-titulo").textContent = g ? "Editar gasto" : "Novo gasto";
  $("#g-valor").value = g ? centavosParaTexto(g.valor) : "";
  $("#g-data").value = g ? g.data : hoje();
  $("#g-descricao").value = g ? g.descricao : "";
  $("#g-obs").value = g ? g.obs || "" : "";
  const ultimaCat = pref.get("ultimaCategoria", "");
  $("#g-categoria").innerHTML = opcoes(cats(), g ? g.categoria : ultimaCat, null);
  // novo gasto já vem com um pagamento (pago à vista); remova se ainda não foi pago
  pgs = g ? g.pagamentos.map((p) => ({ ...p, valorTxt: centavosParaTexto(p.valor) })) : [novoPagamento()];
  renderPgs();
  $("#g-erro").textContent = "";
  $("#g-excluir").hidden = !g;
  $("#g-excluir").dataset.confirmar = "";
  $("#g-excluir").textContent = "Excluir";
  dlg.showModal();
  $("#form-gasto").scrollTop = 0;
  if (!g) setTimeout(() => $("#g-valor").focus(), 50);
}

$("#form-gasto").addEventListener("submit", (e) => {
  e.preventDefault();
  lerPgsDoDom();
  const erro = $("#g-erro");
  const falhar = (msg, foco) => { erro.textContent = msg; if (foco) $(foco)?.focus(); };
  const valor = parseValor($("#g-valor").value);
  if (!(valor > 0)) return falhar("Informe o valor total do gasto, por exemplo 1.250,00.", "#g-valor");
  if (!$("#g-data").value) return falhar("Informe a data do gasto.", "#g-data");

  const vazios = pgs.filter((p) => !String(p.valorTxt || "").trim());
  if (vazios.length > 1) return falhar("Informe o valor de cada pagamento.");
  const somaPreenchidos = pgs.reduce((t, p) => t + (String(p.valorTxt || "").trim() ? parseValor(p.valorTxt) || 0 : 0), 0);
  const pagamentos = [];
  for (const [i, p] of pgs.entries()) {
    let v = String(p.valorTxt || "").trim() ? parseValor(p.valorTxt) : valor - somaPreenchidos;
    if (!(v > 0)) return falhar(`Informe o valor do pagamento ${i + 1}.`, `#pg-valor-${i}`);
    if (!p.data) return falhar(`Informe a data do pagamento ${i + 1}.`, `#pg-data-${i}`);
    pagamentos.push({ id: p.id, valor: v, data: p.data, fonte: p.fonte, comprovante: p.comprovante || null });
  }
  const totalPago = pagamentos.reduce((t, p) => t + p.valor, 0);
  if (totalPago > valor) return falhar(`Os pagamentos somam ${money(totalPago)}, mais que o valor do gasto (${money(valor)}). Ajuste os valores.`);

  // comprovantes: envia os novos que continuam anexados e apaga os que saíram
  const usados = new Set(pagamentos.map((p) => p.comprovante?.id).filter(Boolean));
  for (const [cid, arq] of compNovos) {
    if (usados.has(cid)) Promise.resolve(store.salvarComprovante(arq)).catch((err) => toast("Não foi possível salvar o comprovante: " + (err.message || err)));
  }
  for (const p of editando?.pagamentos || []) {
    if (p.comprovante && !usados.has(p.comprovante.id)) Promise.resolve(store.excluirComprovante(p.comprovante.id)).catch(() => {});
  }

  const agora = new Date().toISOString();
  const g = {
    valor,
    data: $("#g-data").value,
    descricao: $("#g-descricao").value.trim(),
    categoria: $("#g-categoria").value,
    obs: $("#g-obs").value.trim(),
    pagamentos,
    criadoEm: editando?.criadoEm || agora,
    criadoPor: editando?.criadoPor || autor(),
    ...(editando ? { editadoEm: agora } : {}),
  };
  pref.set("ultimaCategoria", g.categoria);
  if (pagamentos.length) pref.set("ultimaFonte", pagamentos[pagamentos.length - 1].fonte);
  const prom = editando ? store.updateGasto(editando.id, g) : store.addGasto(g);
  Promise.resolve(prom).catch((err) => toast("Não foi possível salvar: " + (err.message || err)));
  const eraEdicao = !!editando;
  editando = null;
  compNovos = new Map();
  dlg.close();
  const falta = valor - totalPago;
  toast(eraEdicao ? "Gasto atualizado" : falta > 0 ? `Gasto lançado · falta pagar ${money(falta)}` : `Gasto de ${money(valor)} lançado`);
});

$("#g-excluir").addEventListener("click", (e) => {
  const b = e.currentTarget;
  if (!b.dataset.confirmar) { b.dataset.confirmar = "1"; b.textContent = "Toque de novo para excluir"; return; }
  for (const p of editando?.pagamentos || []) {
    if (p.comprovante) Promise.resolve(store.excluirComprovante(p.comprovante.id)).catch(() => {});
  }
  Promise.resolve(store.deleteGasto(editando.id)).catch((err) => toast("Não foi possível excluir: " + (err.message || err)));
  editando = null;
  dlg.close();
  toast("Gasto excluído");
});

$("#pg-add").addEventListener("click", () => {
  lerPgsDoDom();
  const p = novoPagamento();
  pgs.push(p);
  renderPgs();
  $(`#pg-valor-${pgs.length - 1}`)?.focus();
});

dlg.addEventListener("click", async (e) => {
  if (e.target === dlg || e.target.closest("[data-fechar]")) { dlg.close(); return; }
  const rem = e.target.closest("[data-pg-remover]");
  if (rem) { lerPgsDoDom(); pgs.splice(+rem.dataset.pgRemover, 1); renderPgs(); return; }
  const tirar = e.target.closest("[data-pg-tirar]");
  if (tirar) { lerPgsDoDom(); pgs[+tirar.dataset.pgTirar].comprovante = null; renderPgs(); return; }
  const ver = e.target.closest("[data-pg-ver]");
  if (ver) { const c = pgs[+ver.dataset.pgVer].comprovante; if (c) verComprovante(c); }
});

dlg.addEventListener("input", (e) => {
  if (e.target.matches("#g-valor, .pg-valor")) { lerPgsDoDom(); atualizarResumoPg(); }
});
dlg.addEventListener("change", async (e) => {
  if (!e.target.matches(".pg-arq")) return;
  const file = e.target.files?.[0];
  if (!file) return;
  lerPgsDoDom();
  const i = +e.target.dataset.i;
  toast("Preparando comprovante…");
  try {
    const arq = await prepararArquivo(file);
    compNovos.set(arq.id, arq);
    pgs[i].comprovante = { id: arq.id, nome: arq.nome, tipo: arq.tipo, tamanho: arq.tamanho };
    renderPgs();
    toast("Comprovante anexado. Toque em Salvar para guardar.");
  } catch (err) {
    toast(err.message || "Não foi possível anexar o arquivo.");
  }
});
// valor total mudou: atualiza as sugestões dos pagamentos
$("#g-valor").addEventListener("change", () => { lerPgsDoDom(); renderPgs(); });

// ---------- visualizar comprovante ----------
const dlgComp = $("#dlg-comp");
let compAtual = null;
async function verComprovante(c) {
  compAtual = null;
  $("#comp-nome").textContent = c.nome;
  const corpo = $("#comp-corpo");
  corpo.innerHTML = `<p class="vazio-pequeno">Carregando comprovante…</p>`;
  $("#comp-abrir").hidden = true;
  $("#comp-baixar").hidden = true;
  dlgComp.showModal();
  try {
    const arq = compNovos.get(c.id) || await store.lerComprovante(c.id);
    if (!arq || !arq.dados) throw new Error("Comprovante não encontrado. Ele pode ainda estar sendo enviado do outro celular.");
    compAtual = arq;
    corpo.innerHTML = arq.tipo.startsWith("image/")
      ? `<img src="${arq.dados}" alt="Comprovante ${esc(arq.nome)}">`
      : `<div class="comp-pdf">${ICONE_CLIPE}<p><strong>${esc(arq.nome)}</strong><br>PDF · ${fmtTamanho(arq.tamanho)}</p></div>`;
    $("#comp-abrir").hidden = false;
    $("#comp-baixar").hidden = false;
  } catch (err) {
    corpo.innerHTML = `<p class="erro">${esc(err.message || "Não foi possível abrir o comprovante.")}</p>`;
  }
}
$("#comp-abrir").addEventListener("click", () => {
  if (!compAtual) return;
  const url = URL.createObjectURL(dataURLParaBlob(compAtual.dados));
  const w = window.open(url, "_blank");
  if (!w) location.assign(url);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
});
$("#comp-baixar").addEventListener("click", () => {
  if (compAtual) baixarArquivo(compAtual.nome, dataURLParaBlob(compAtual.dados));
});
dlgComp.addEventListener("click", (e) => {
  if (e.target === dlgComp || e.target.closest("[data-fechar-comp]")) dlgComp.close();
});

// formata o valor ao sair do campo
document.addEventListener("focusout", (e) => {
  const el = e.target;
  if (el.matches?.("#g-valor, #a-meta, .ef-valor, .pg-valor")) {
    const v = parseValor(el.value);
    if (v > 0) el.value = centavosParaTexto(v);
  }
});

// ---------- eventos das telas ----------
const view = $("#view");

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

view.addEventListener("click", async (e) => {
  if (e.target.closest("[data-ver-apagar]")) { filtro.situacao = "aberto"; return; }
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
    if (pagamentosDe(S.gastos).some((p) => p.fonte === id)) return toast("Essa origem tem pagamentos e não pode ser removida.");
    salvarCfg({ fontes: lerFontesDoForm().filter((f) => f.id !== id) });
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
    baixarArquivo(`gastos-obra-${hoje()}.csv`, gerarCSV(), "text/csv;charset=utf-8");
  } else if (acao === "compartilhar") {
    const texto = textoResumo();
    try {
      const arquivo = new File([gerarCSV()], `gastos-obra-${hoje()}.csv`, { type: "text/csv" });
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
    toast("Preparando backup…");
    let comprovantes = [];
    try { comprovantes = await store.listarComprovantes(); }
    catch (err) { toast("Não consegui incluir os comprovantes (sem internet?). O backup segue sem eles."); }
    const dados = { app: "minha-obra", versao: 2, exportadoEm: new Date().toISOString(), config: S.config, gastos: S.gastos, comprovantes };
    baixarArquivo(`backup-obra-${hoje()}.json`, JSON.stringify(dados), "application/json");
  } else if (acao === "sair") {
    await store.sair();
  }
});

view.addEventListener("submit", (e) => {
  e.preventDefault();
  if (e.target.id === "form-obra") {
    const metaTxt = $("#a-meta").value.trim();
    const meta = metaTxt ? parseValor(metaTxt) : 0;
    if (metaTxt && !(meta >= 0)) return toast("Não entendi o valor da meta. Use, por exemplo, 350.000,00.");
    salvarCfg({ nome: $("#a-nome").value.trim() || "Minha Casa", meta: meta || 0 });
    view.dataset.tela = "";
    render();
    toast("Dados da obra salvos");
  } else if (e.target.id === "form-fontes") {
    salvarCfg({ fontes: lerFontesDoForm() });
    view.dataset.tela = "";
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
  const mapa = { "f-mes": [filtro, "mes"], "f-categoria": [filtro, "categoria"], "f-fonte": [filtro, "fonte"], "f-situacao": [filtro, "situacao"],
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
      if (!dados || !Array.isArray(dados.gastos)) throw new Error("o arquivo não é um backup do Minha Obra");
      toast("Restaurando…");
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
