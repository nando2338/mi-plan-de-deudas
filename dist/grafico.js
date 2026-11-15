/* Pestaña "Gráfico" (versión 1.2): dona de lo pagado en un periodo, una moneda a la vez.
   Nunca mezcla USD y COP en la misma dona. Datos del usuario solo con textContent. */
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
  const switchBox = el("div", "switch chart-currency");
  switchBox.setAttribute("role", "group");
  let cur = "USD";
  const curButtons = ["USD", "COP"].map((c) => {
    const b = raw("button", c);
    b.type = "button";
    b.dataset.chartCur = c;
    b.addEventListener("click", () => {
      cur = c;
      safeRender();
    });
    switchBox.append(b);
    return b;
  });
  const msg = el("p", "label");
  msg.setAttribute("role", "status");
  const chartBox = el("div", "donut-box");
  const legend = el("ul", "donut-legend");
  const listTitle = el("h3", "", T.listTitle);
  const list = el("ul", "pay-list");
  section.append(el("h2", "", T.title), el("p", "label", T.intro), controls, switchBox, msg, chartBox, legend, listTitle, list);
  view.append(section);

  function arc(cx, cy, r, a0, a1) {
    const p = (a) => [cx + r * Math.sin(a), cy - r * Math.cos(a)];
    const [x0, y0] = p(a0),
      [x1, y1] = p(a1);
    return `M ${x0.toFixed(3)} ${y0.toFixed(3)} A ${r} ${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(3)} ${y1.toFixed(3)}`;
  }
  function render() {
    for (const b of curButtons) b.classList.toggle("active", b.dataset.chartCur === cur);
    for (const b of curButtons) b.setAttribute("aria-pressed", String(b.dataset.chartCur === cur));
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
    chartBox.append(svg);
    if (!pays.length) msg.textContent = T.empty;
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
  // Default currency for the chart: the one with payments in the period, else the app default.
  try {
    const pref = localStorage.getItem("deudas-currency-pref-v1");
    if (pref === "COP" || pref === "USD") cur = pref;
  } catch (_) {}
  window.MPDDChart = { render: safeRender, setCurrency: (c) => ((cur = c === "COP" ? "COP" : "USD"), safeRender()), setRange: (f, t) => ((fromInput.value = f), (toInput.value = t), safeRender()) };
  safeRender();
})();
