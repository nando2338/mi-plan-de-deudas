/* Pestaña "Gráfico": "Lo que debo" (1.4, por defecto) y "Lo que pagué" (dona de lo pagado
   en un periodo, versión 1.2). Una moneda a la vez: nunca mezcla ni convierte USD y COP.
   Datos del usuario solo con textContent; el SVG se arma con APIs del DOM. */
(function () {
  "use strict";
  const view = document.getElementById("view-chart");
  const S = window.MPDDSchedule;
  if (!view || !S || !window.formatMoney) return;
  const T = {
    title: "Pagos por periodo",
    intro: "Distribución de lo que pagaste entre dos fechas. Cada moneda se muestra por separado.",
    from: "Desde",
    to: "Hasta",
    groupBy: "Agrupar por",
    byDebt: "Deuda",
    byCategory: "Categoría",
    currency: "Moneda",
    totalPaid: "Total pagado",
    empty: "No hay pagos en esta moneda en el periodo elegido.",
    listTitle: "Pagos del periodo",
    listEmpty: "No hay pagos registrados en el periodo.",
    badRange: "La fecha «Desde» debe ser anterior o igual a «Hasta».",
    dueShort: "Vence:",
    // 1.4 "Lo que debo"
    chartTitle: "Tu gráfico",
    modeOwe: "Lo que debo",
    modePaid: "Lo que pagué",
    modeLabel: "Qué quieres ver",
    viewLabel: "Periodo",
    viewMonth: "Este mes",
    viewTotal: "Deuda total",
    oweIntroMonth: "Lo que te falta pagar este mes en cada deuda: tu plan si lo tienes, si no la cuota o pago mínimo.",
    oweIntroTotal: "El saldo que debes hoy en cada deuda.",
    alsoHave: "También tienes",
    debtIn: "deuda en",
    debtsIn: "deudas en",
    noDebtsAtAll: "Aún no tienes deudas registradas. Agrega una para ver aquí lo que debes.",
    noDebtsIn: "No tienes deudas en",
    addDebt: "Agregar deuda",
    nothingThisMonth: "No tienes pagos pendientes este mes en esta moneda.",
    seeTotal: "Ver deuda total",
    unknownMonth: "Deudas sin cuota definida:",
    rate: "Tasa:",
    ratePending: "Tasa pendiente",
    tagPricey: "Más cara",
    tagSmall: "Más pequeña",
    tagOverdue: "Pago vencido",
    tipBiggest: "Tu deuda más grande es",
    tipButCostly: ", pero la que más te cuesta es",
    tipBiggestSame: "Tu deuda más grande,",
    tipAlsoCostly: ", también es la que más te cuesta.",
    tipNoRates: "Agrega la tasa de interés de tus deudas para saber cuál te cuesta más.",
    compare: "Comparar en Métodos",
    donutOf: "Gráfico de dona:",
  };
  window.MPDDStrings = Object.assign(window.MPDDStrings || {}, { grafico: T });
  const COLORS = ["#146a55", "#d8a03a", "#4f7cac", "#b5523b", "#7a5aa6", "#3f9c8a", "#c47a9b", "#7d8b3a", "#5b6770", "#e07b39"];
  const SVG = "http://www.w3.org/2000/svg";
  const en = () => document.documentElement.lang === "en";
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  const raw = (tag, text, cls) => {
    const n = el(tag, cls, text);
    n.dataset.localizedOutput = "true";
    return n;
  };
  const appDebts = () => {
    try {
      return Array.isArray(debts) ? debts : [];
    } catch (_) {
      return [];
    }
  };
  const today = () => new Date().toLocaleDateString("en-CA");
  function chip(status) {
    const label = { onTime: "Pagado a tiempo", late: "Pagado tarde", paid: "Pagado" }[status] || "Pagado";
    return el("span", "status-chip st-" + status, label);
  }

  const section = el("section", "overview chart-view");
  const controls = el("div", "formgrid chart-controls");
  function field(label, input) {
    const w = el("div", "field");
    const l = el("label", "", label);
    input.id = "chart-" + label.toLowerCase().replace(/[^a-z]/g, "");
    l.htmlFor = input.id;
    w.append(l, input);
    return w;
  }
  const t0 = today();
  const fromInput = el("input");
  fromInput.type = "date";
  fromInput.value = t0.slice(0, 8) + "01";
  const toInput = el("input");
  toInput.type = "date";
  toInput.value = S.monthEnd(+t0.slice(0, 4), +t0.slice(5, 7));
  const group = el("select");
  for (const [v, l] of [
    ["debt", T.byDebt],
    ["category", T.byCategory],
  ]) {
    const o = el("option", "", l);
    o.value = v;
    group.append(o);
  }
  controls.append(field(T.from, fromInput), field(T.to, toInput), field(T.groupBy, group));
  /* Toggle group: buttons with aria-pressed. */
  function toggles(cls, label, options, onPick) {
    const box = el("div", "switch " + cls);
    box.setAttribute("role", "group");
    const lab = el("span", "visually-hidden", label);
    lab.id = cls + "-label";
    box.setAttribute("aria-labelledby", lab.id);
    box.append(lab);
    const buttons = options.map(([value, text, isRaw]) => {
      const b = isRaw ? raw("button", text) : el("button", "", text);
      b.type = "button";
      b.dataset.value = value;
      b.addEventListener("click", () => onPick(value));
      box.append(b);
      return b;
    });
    return { box, buttons };
  }
  const mark = (buttons, value) => {
    for (const b of buttons) {
      b.classList.toggle("active", b.dataset.value === value);
      b.setAttribute("aria-pressed", String(b.dataset.value === value));
    }
  };
  let cur = "USD";
  let mode = "owe";
  let oweView = "month";
  const curSwitch = toggles("chart-currency", T.currency, [["USD", "USD", true], ["COP", "COP", true]], (c) => ((cur = c), safeRender()));
  const curButtons = curSwitch.buttons;
  for (const b of curButtons) b.dataset.chartCur = b.dataset.value;
  const switchBox = curSwitch.box;
  const modeSwitch = toggles("chart-mode", T.modeLabel, [["owe", T.modeOwe], ["paid", T.modePaid]], (m) => ((mode = m), safeRender()));
  for (const b of modeSwitch.buttons) b.dataset.chartMode = b.dataset.value;
  const topBar = el("div", "chart-top");
  topBar.append(switchBox, modeSwitch.box);

  /* ---------- "Lo que debo" (1.4) ---------- */
  const owePanel = el("div", "owe-panel");
  owePanel.dataset.panel = "owe";
  const viewSwitch = toggles("owe-views", T.viewLabel, [["month", T.viewMonth], ["total", T.viewTotal]], (v) => ((oweView = v), safeRender()));
  for (const b of viewSwitch.buttons) b.dataset.oweView = b.dataset.value;
  const oweIntro = el("p", "label owe-intro");
  const oweOther = el("p", "owe-other");
  const oweBody = el("div", "owe-body");
  oweBody.setAttribute("aria-live", "polite");
  owePanel.append(viewSwitch.box, oweIntro, oweOther, oweBody);

  /* ---------- "Lo que pagué" (1.2) ---------- */
  const paidPanel = el("div", "paid-panel");
  paidPanel.dataset.panel = "paid";
  const msg = el("p", "label");
  msg.setAttribute("role", "status");
  const chartBox = el("div", "donut-box");
  const legend = el("ul", "donut-legend");
  const listTitle = el("h3", "", T.listTitle);
  const list = el("ul", "pay-list");
  paidPanel.append(el("h3", "", T.title), el("p", "label", T.intro), controls, msg, chartBox, legend, listTitle, list);
  section.append(el("h2", "", T.chartTitle), topBar, owePanel, paidPanel);
  view.append(section);

  function arc(cx, cy, r, a0, a1) {
    const p = (a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
    const [x0, y0] = p(a0),
      [x1, y1] = p(a1);
    return `M ${x0.toFixed(3)} ${y0.toFixed(3)} A ${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(3)} ${y1.toFixed(3)}`;
  }
  function svgEl(tag, attrs) {
    const n = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, String(v));
    return n;
  }
  /* Ring segments: parts = [{ share (0..1), color }]. */
  function ring(svg, parts) {
    svg.append(svgEl("circle", { cx: 100, cy: 100, r: 70, fill: "none", stroke: "#e6ece6", "stroke-width": 28 }));
    let a = 0;
    for (const part of parts) {
      if (part.share >= 0.9999) svg.append(svgEl("circle", { cx: 100, cy: 100, r: 70, fill: "none", stroke: part.color, "stroke-width": 28, class: "seg" }));
      else if (part.share > 0) svg.append(svgEl("path", { d: arc(100, 100, 70, a, a + part.share * 2 * Math.PI), fill: "none", stroke: part.color, "stroke-width": 28, class: "seg" }));
      a += part.share * 2 * Math.PI;
    }
  }
  const OWE_COLORS = ["#146a55", "#d8a03a", "#4f7cac", "#7a5aa6", "#3f9c8a", "#c47a9b", "#7d8b3a", "#5b6770", "#e07b39", "#2f4858", "#9c7b2f", "#6b8fd6"];
  function fmtRate(n) {
    return new Intl.NumberFormat(en() ? "en-US" : "es-CO", { maximumFractionDigits: 2 }).format(n) + "%";
  }
  function goMethods() {
    if (typeof window.MPDDNavigate === "function") window.MPDDNavigate("methods");
    else {
      const b = document.querySelector('.bottom-nav [data-target="methods"]');
      if (b) b.click();
    }
  }
  function button(text, cls, onClick) {
    const b = el("button", cls, text);
    b.type = "button";
    b.addEventListener("click", onClick);
    return b;
  }
  function renderOwe() {
    mark(viewSwitch.buttons, oweView);
    oweBody.replaceChildren();
    oweOther.replaceChildren();
    oweIntro.textContent = oweView === "month" ? T.oweIntroMonth : T.oweIntroTotal;
    const planned = window.MPDDPlan && typeof window.MPDDPlan.planned === "function" ? window.MPDDPlan.planned() : {};
    const r = S.owed(appDebts(), { currency: cur, view: oweView, today: today(), planned });
    // Debts in the other currency: mentioned only, never converted.
    for (const c of MPDDMoney.ordered(r.others)) {
      const n = r.others[c];
      oweOther.append(el("span", "", T.alsoHave), " ", raw("span", String(n)), " ", el("span", "", n === 1 ? T.debtIn : T.debtsIn), " ", raw("span", c));
    }
    oweOther.hidden = !oweOther.childNodes.length;
    if (!r.count) {
      const box = el("div", "owe-empty");
      if (!Object.keys(r.others).length) box.append(el("p", "", T.noDebtsAtAll));
      else {
        const p = el("p", "");
        p.append(el("span", "", T.noDebtsIn), " ", raw("span", cur), ".");
        box.append(p);
      }
      const add = button(T.addDebt, "owe-add", () => window.MPDDApp && window.MPDDApp.openAdd());
      add.disabled = !!(window.MPDDApp && window.MPDDApp.isLocked && window.MPDDApp.isLocked());
      box.append(add);
      oweBody.append(box);
      return;
    }
    const unknownNote = () => {
      const u = el("p", "label owe-unknown");
      u.append(el("span", "", T.unknownMonth), " ", raw("strong", String(r.unknown)));
      return u;
    };
    if (!r.items.length) {
      const box = el("div", "owe-empty");
      box.append(el("p", "", T.nothingThisMonth));
      if (r.unknown) box.append(unknownNote());
      box.append(button(T.seeTotal, "ghost", () => ((oweView = "total"), safeRender())));
      oweBody.append(box);
      return;
    }
    const colored = r.items.map((it, i) => Object.assign({ color: OWE_COLORS[i % OWE_COLORS.length] }, it));
    // Text alternative for the donut, read through aria-labelledby (translatable text nodes).
    const desc = el("p", "visually-hidden");
    desc.id = "owe-donut-desc";
    desc.append(el("span", "", T.donutOf), " ", el("span", "", oweView === "month" ? T.viewMonth : T.viewTotal), " ", raw("span", MPDDMoney.formatMoney(r.total, cur)), ". ");
    for (const it of colored) desc.append(raw("span", it.name + ": " + MPDDMoney.formatMoney(it.amount, cur) + " (" + Math.round(it.share * 100) + "%). "));
    const svg = svgEl("svg", { viewBox: "0 0 200 200", class: "donut owe-donut", role: "img", "aria-labelledby": desc.id });
    ring(svg, colored);
    const t1 = svgEl("text", { x: 100, y: 94, "text-anchor": "middle", class: "donut-label owe-center-label", "aria-hidden": "true" });
    t1.textContent = oweView === "month" ? T.viewMonth : T.viewTotal;
    const t2 = svgEl("text", { x: 100, y: 116, "text-anchor": "middle", class: "donut-total owe-center-total", "data-localized-output": "true", "aria-hidden": "true" });
    t2.textContent = MPDDMoney.formatMoney(r.total, cur);
    // Keep long totals (e.g. millions of COP) inside the ring.
    const len = t2.textContent.length;
    t2.style.fontSize = (len > 16 ? 9 : len > 13 ? 10.5 : 12) + "px";
    svg.append(t1, t2);
    const box = el("div", "donut-box");
    box.append(svg);
    const ul = el("ul", "owe-list");
    for (const it of colored) {
      const li = el("li", "owe-row" + (it.overdue ? " is-overdue" : ""));
      li.dataset.debtId = it.debtId;
      const sw = el("i", "swatch");
      sw.style.background = it.color;
      sw.setAttribute("aria-hidden", "true");
      const main = el("div", "owe-main");
      const name = el("div", "owe-name");
      name.append(raw("strong", it.name));
      if (it.debtId === r.mostExpensiveId) name.append(el("span", "owe-tag tag-pricey", T.tagPricey));
      if (it.debtId === r.smallestId) name.append(el("span", "owe-tag tag-small", T.tagSmall));
      if (it.overdue) name.append(el("span", "owe-tag tag-overdue", T.tagOverdue));
      const meta = el("div", "label owe-rate");
      if (it.rate !== null) meta.append(el("span", "", T.rate), " ", raw("span", fmtRate(it.rate)));
      else meta.append(el("span", "", T.ratePending));
      main.append(name, meta);
      const nums = el("div", "owe-nums");
      nums.append(raw("span", MPDDMoney.formatMoney(it.amount, cur), "owe-amount"), raw("span", Math.round(it.share * 100) + "%", "owe-pct"));
      li.append(sw, main, nums);
      ul.append(li);
    }
    oweBody.append(desc, box, ul);
    if (r.unknown) oweBody.append(unknownNote());
    // Tip: biggest debt vs the one that costs the most.
    const tip = el("div", "owe-tip");
    if (r.count >= 2 && r.biggest) {
      const p = el("p", "owe-tip-text");
      if (!r.priciest) p.append(el("span", "", T.tipBiggest), " ", raw("strong", r.biggest.name), ". ", el("span", "", T.tipNoRates));
      else if (r.priciest.debtId === r.biggest.debtId) p.append(el("span", "", T.tipBiggestSame), " ", raw("strong", r.biggest.name), el("span", "", T.tipAlsoCostly));
      else p.append(el("span", "", T.tipBiggest), " ", raw("strong", r.biggest.name), el("span", "", T.tipButCostly), " ", raw("strong", r.priciest.name), ".");
      tip.append(p);
    }
    tip.append(button(T.compare, "ghost owe-compare", goMethods));
    oweBody.append(tip);
  }
  function render() {
    mark(curButtons, cur);
    mark(modeSwitch.buttons, mode);
    owePanel.hidden = mode !== "owe";
    paidPanel.hidden = mode !== "paid";
    renderOwe();
    renderPaid();
  }
  function renderPaid() {
    chartBox.replaceChildren();
    legend.replaceChildren();
    list.replaceChildren();
    msg.textContent = "";
    const from = fromInput.value,
      to = toInput.value;
    if (!S.validDate(from) || !S.validDate(to) || from > to) {
      msg.textContent = T.badRange;
      return;
    }
    const all = S.payments(appDebts(), { from, to });
    const pays = all.filter((p) => p.currency === cur && p.amount > 0);
    const byKey = new Map();
    for (const p of pays) {
      const k = group.value === "category" ? p.category : p.debtId;
      const label = group.value === "category" ? p.category : p.name;
      const e = byKey.get(k) || { label, amount: 0 };
      e.amount += p.amount;
      byKey.set(k, e);
    }
    const parts = [...byKey.values()].sort((a, b) => b.amount - a.amount);
    const total = parts.reduce((a, x) => a + x.amount, 0);
    const svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("viewBox", "0 0 200 200");
    svg.setAttribute("class", "donut");
    svg.setAttribute("role", "img");
    const label = (en() ? "Total paid " : T.totalPaid + " ") + formatMoney(total, cur);
    svg.setAttribute("aria-label", label);
    const bg = document.createElementNS(SVG, "circle");
    bg.setAttribute("cx", "100");
    bg.setAttribute("cy", "100");
    bg.setAttribute("r", "70");
    bg.setAttribute("fill", "none");
    bg.setAttribute("stroke", "#e6ece6");
    bg.setAttribute("stroke-width", "28");
    svg.append(bg);
    let a = 0;
    parts.forEach((part, i) => {
      const frac = total ? part.amount / total : 0;
      const color = COLORS[i % COLORS.length];
      if (frac >= 0.9999) {
        const c = document.createElementNS(SVG, "circle");
        c.setAttribute("cx", "100");
        c.setAttribute("cy", "100");
        c.setAttribute("r", "70");
        c.setAttribute("fill", "none");
        c.setAttribute("stroke", color);
        c.setAttribute("stroke-width", "28");
        svg.append(c);
      } else if (frac > 0) {
        const path = document.createElementNS(SVG, "path");
        path.setAttribute("d", arc(100, 100, 70, a, a + frac * 2 * Math.PI));
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", color);
        path.setAttribute("stroke-width", "28");
        svg.append(path);
      }
      a += frac * 2 * Math.PI;
      const li = el("li");
      const sw = el("i", "swatch");
      sw.style.background = color;
      li.append(sw, raw("span", part.label, "lg-name"), raw("span", formatMoney(part.amount, cur), "lg-amount"), raw("span", Math.round(frac * 100) + "%", "lg-pct"));
      legend.append(li);
    });
    const t1 = document.createElementNS(SVG, "text");
    t1.setAttribute("x", "100");
    t1.setAttribute("y", "94");
    t1.setAttribute("text-anchor", "middle");
    t1.setAttribute("class", "donut-label");
    t1.textContent = en() ? "Total paid" : T.totalPaid;
    const t2 = document.createElementNS(SVG, "text");
    t2.setAttribute("x", "100");
    t2.setAttribute("y", "116");
    t2.setAttribute("text-anchor", "middle");
    t2.setAttribute("class", "donut-total");
    t2.textContent = formatMoney(total, cur);
    t2.setAttribute("data-localized-output", "true");
    svg.append(t1, t2);
    // Never draw an empty donut.
    if (pays.length) chartBox.append(svg);
    else msg.textContent = T.empty;
    // List: every payment of the period, each with its own currency (no sums across currencies).
    if (!all.length) list.append(el("li", "label", T.listEmpty));
    for (const p of all) {
      const li = el("li", "pay-row");
      li.append(chip(p.status));
      const body = el("div", "pay-body");
      body.append(raw("strong", p.name), raw("span", formatMoney(p.amount, p.currency), "pay-amount"));
      const meta = el("span", "label");
      meta.append(raw("span", p.date));
      if (p.dueDate) meta.append(" · ", el("span", "", T.dueShort), " ", raw("span", p.dueDate));
      body.append(meta);
      li.append(body);
      list.append(li);
    }
  }
  function safeRender() {
    try {
      render();
    } catch (_) {}
  }
  for (const i of [fromInput, toInput, group]) i.addEventListener("change", safeRender);
  document.addEventListener("mpdd:rendered", safeRender);
  document.addEventListener("deudas:languagechange", safeRender);
  document.addEventListener("mpdd:planchange", safeRender);
  // Default currency for the chart: the one with payments in the period, else the app default.
  try {
    const pref = localStorage.getItem("deudas-currency-pref-v1");
    if (pref === "COP" || pref === "USD") cur = pref;
  } catch (_) {}
  // If the preferred currency has no debts but the other one does, start with the other one.
  try {
    const owing = appDebts().filter((d) => Number(d.balance) > 0);
    if (!owing.some((d) => d.currency === cur) && owing.some((d) => d.currency === (cur === "USD" ? "COP" : "USD"))) cur = cur === "USD" ? "COP" : "USD";
  } catch (_) {}
  window.MPDDChart = { render: safeRender, setMode: (m) => ((mode = m === "paid" ? "paid" : "owe"), safeRender()), setView: (v) => ((oweView = v === "total" ? "total" : "month"), safeRender()), setCurrency: (c) => ((cur = c === "COP" ? "COP" : "USD"), safeRender()), setRange: (f, t) => ((fromInput.value = f), (toInput.value = t), safeRender()) };
  safeRender();
})();
