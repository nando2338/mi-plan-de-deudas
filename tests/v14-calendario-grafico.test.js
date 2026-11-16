/* Pruebas de la versión 1.4: calendario con pagos marcados y "Próximos pagos",
   y gráfico "Lo que debo". Ejecutar: cd tests && npm test */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../dist/schedule-core.js");
const Money = require("../dist/money.js");
const I18n = require("../dist/i18n.js");
const { load, closeAll, sleep, debt } = require("./harness");
test.afterEach(closeAll);

const ES = { "deudas-lang-v1": "es" };
const today = () => new Date().toLocaleDateString("en-CA");
const plus = (n) => S.addDays(today(), n);
const dayNum = (n) => String(+plus(n).slice(8, 10));
const fm = Money.formatMoney;

async function open(store, extra) {
  const h = load({ storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify(store) }, extra || {}) });
  await sleep(80);
  return h;
}
/* Shows the month of a date in the calendar and returns its cell. */
function cellOf(h, date) {
  h.win.MPDDCalendar.show(+date.slice(0, 4), +date.slice(5, 7));
  return h.doc.querySelector(`.cal-day[data-date="${date}"]`);
}

/* ---------------- Calendario ---------------- */

test("calendario: colores de pendiente, pagado, vencido y hoy", async () => {
  const store = [
    debt("a", "Vencida", { due: dayNum(-3), createdAt: plus(-10), minPayment: 30 }),
    debt("b", "Próxima", { due: dayNum(2), createdAt: plus(-1), minPayment: 20 }),
    debt("c", "Pagada", { due: dayNum(-5), createdAt: plus(-10), minPayment: 25, history: [{ amount: 25, date: plus(-6), dueDate: plus(-5) }] }),
    debt("d", "Hoy", { due: dayNum(0), createdAt: plus(-1), minPayment: 10 }),
  ];
  const h = await open(store);
  const late = cellOf(h, plus(-3));
  assert.ok(late.classList.contains("c-late"), "vencido sin pagar en rojo");
  assert.ok(late.querySelector(".dot"), "un pago: punto");
  const pending = cellOf(h, plus(2));
  assert.ok(pending.classList.contains("c-pending"), "pendiente en naranja");
  assert.ok(pending.querySelector(".dot"), "pendiente con punto");
  const paid = cellOf(h, plus(-5));
  assert.ok(paid.classList.contains("c-paid"), "pagado en verde");
  assert.ok(cellOf(h, plus(-6)).classList.contains("c-paid"), "el día en que se pagó también es verde");
  // Today: dark border only (c-today), and its own state (pending) is kept on the dot.
  const t = cellOf(h, today());
  assert.ok(t.classList.contains("c-today"));
  assert.ok(t.classList.contains("c-pending"), "hoy conserva el estado del pago");
  assert.ok(t.querySelector(".dot"));
  assert.equal(t.getAttribute("aria-current"), "date");
  assert.match(t.getAttribute("aria-label"), /hoy.*1 pago.*pendiente/);
  // Pure logic: "today" is no longer a color; paid late counts as paid; overdue wins.
  assert.equal(S.dayColor(today(), today(), [], []), "none");
  assert.equal(S.dayColor("2026-01-01", "2026-02-01", [{ status: "late" }], []), "paid");
  assert.equal(S.dayColor("2026-01-01", "2026-02-01", [{ status: "onTime" }, { status: "overdue" }], []), "late");
  assert.equal(S.dayColor("2026-01-01", "2026-01-01", [{ status: "onTime" }, { status: "dueToday" }], []), "pending");
  // Today without payments: border only, no state color.
  const h2 = await open([debt("x", "X", { due: dayNum(2), createdAt: plus(-1) })]);
  const t2 = cellOf(h2, today());
  assert.ok(t2.classList.contains("c-today") && t2.classList.contains("c-none"));
  assert.equal(t2.querySelector(".dot, .cal-count"), null);
});

test("calendario: varios pagos el mismo día muestran la cantidad", async () => {
  const store = [
    debt("e", "Moto", { currency: "COP", balance: 2000000, due: dayNum(4), createdAt: plus(-1), minPayment: 200000 }),
    debt("f", "Celular", { due: dayNum(4), createdAt: plus(-1), minPayment: 40 }),
    debt("g", "Tarjeta", { due: dayNum(4), createdAt: plus(-1), minPayment: 15 }),
  ];
  const h = await open(store);
  const cell = cellOf(h, plus(4));
  assert.equal(cell.querySelector(".cal-count").textContent, "3");
  assert.equal(cell.querySelector(".dot"), null, "sin punto cuando hay varios");
  assert.match(cell.getAttribute("aria-label"), /3 pagos/);
  cell.click();
  const detail = h.doc.querySelector(".cal-detail").textContent;
  for (const n of ["Moto", "Celular", "Tarjeta"]) assert.match(detail, new RegExp(n));
  assert.match(detail, /\$200\.000 COP/);
  assert.match(detail, /US\$40\.00 USD/);
});

test("calendario: leyenda de colores debajo del calendario", async () => {
  const h = await open([]);
  const legend = h.doc.querySelector(".calendar-view .cal-legend");
  assert.ok(legend);
  const grid = h.doc.querySelector(".calendar-view .cal-grid");
  assert.ok(grid.compareDocumentPosition(legend) & h.win.Node.DOCUMENT_POSITION_FOLLOWING, "la leyenda va después del calendario");
  const items = [...legend.querySelectorAll("li")].map((li) => li.textContent);
  assert.deepEqual(items, ["Pago pendiente", "Pagado", "Vencido sin pagar", "Hoy (borde oscuro)", "2Varios pagos (cantidad)", "Sin pagos"]);
  assert.ok(legend.querySelector(".swatch.c-pending .sw-dot"));
  assert.ok(legend.querySelector(".swatch.c-today"));
  assert.equal(legend.getAttribute("aria-labelledby"), "cal-legend-title");
});

test("calendario: Próximos pagos (vencidos y próximos) y tocar una fila abre el día", async () => {
  const store = [
    debt("a", "Vencida", { due: dayNum(-3), createdAt: plus(-10), minPayment: 30 }),
    debt("d", "Hoy", { due: dayNum(0), createdAt: plus(-1), minPayment: 10 }),
    debt("t", "Mañana", { due: dayNum(1), createdAt: plus(-1), minPayment: 12 }),
    debt("e", "Moto", { currency: "COP", balance: 2000000, due: dayNum(4), createdAt: plus(-1), minPayment: 200000 }),
    debt("p", "Pagada", { due: dayNum(4), createdAt: plus(-1), minPayment: 5, history: [{ amount: 5, date: today(), dueDate: plus(4) }] }),
  ];
  // A statement closing date configured in the reminders also appears (as in Avisos).
  const prefs = { e: { cutoffDay: +dayNum(6), cutoffEnabled: true } };
  const h = await open(store, { "nando-recordatorios-v1": JSON.stringify(prefs) });
  const rows = [...h.doc.querySelectorAll(".upcoming-list .upcoming-row")];
  const text = (r) => r.textContent;
  const find = (name, date) => rows.find((r) => r.dataset.date === date && r.querySelector(".up-name").textContent === name);
  const overdue = find("Vencida", plus(-3));
  assert.ok(overdue, "vencida sin pagar en la lista");
  assert.match(text(overdue), /Vencido hace 3 días/);
  assert.match(text(overdue), /US\$30\.00 USD/);
  assert.ok(overdue.classList.contains("is-overdue"));
  assert.match(text(find("Hoy", today())), /Hoy/);
  assert.match(text(find("Mañana", plus(1))), /Mañana.*US\$12\.00 USD/);
  const moto = find("Moto", plus(4));
  assert.match(text(moto), /En 4 días/);
  assert.match(text(moto), /\$200\.000 COP/, "monto en la moneda de la deuda");
  assert.doesNotMatch(text(moto), /USD/);
  assert.equal(find("Pagada", plus(4)), undefined, "lo ya pagado no aparece");
  const cut = rows.find((r) => r.classList.contains("up-cutoff"));
  assert.ok(cut && /Fecha de corte/.test(text(cut)) && /Moto/.test(text(cut)), "fecha de corte de los recordatorios");
  // Order: by date, overdue first.
  const dates = rows.map((r) => r.dataset.date);
  assert.deepEqual(dates, dates.slice().sort());
  assert.equal(rows[0], overdue);
  // Rows are buttons; tapping selects the day and shows its detail.
  assert.equal(overdue.tagName, "BUTTON");
  overdue.click();
  const sel = h.doc.querySelector(".cal-day.selected");
  assert.equal(sel.dataset.date, plus(-3));
  assert.equal(sel.getAttribute("aria-pressed"), "true");
  const detail = h.doc.querySelector(".cal-detail");
  assert.match(detail.textContent, /Vencida/);
  assert.match(detail.textContent, /Vencido/);
  assert.ok([...detail.querySelectorAll("button")].some((b) => b.textContent === "Marcar como pagado"));
  // A row in another month moves the calendar to that month.
  const later = [...h.doc.querySelectorAll(".upcoming-list .upcoming-row")].find((r) => r.dataset.date.slice(0, 7) !== today().slice(0, 7));
  if (later) {
    later.click();
    assert.equal(h.doc.querySelector(".cal-day.selected").dataset.date, later.dataset.date);
  }
  // Pure logic: same items as the old Avisos counter for the next days.
  const up = S.upcoming(store, today(), { daysAhead: 3 });
  assert.equal(up.length, S.badgeCount(store, today(), 3));
  assert.deepEqual(up.find((i) => i.debtId === "a").days, -3);
  // No pending payments: clear message.
  const empty = await open([]);
  assert.match(empty.doc.querySelector(".upcoming-list").textContent, /No tienes pagos pendientes/);
});

test("calendario: Por pagar y Pagado este mes separados por moneda", async () => {
  const t = today();
  const store = [
    debt("u1", "Tarjeta", { due: dayNum(0), createdAt: t.slice(0, 8) + "01", minPayment: 50 }),
    debt("u2", "Carro", { due: dayNum(0), createdAt: t.slice(0, 8) + "01", minPayment: 70.5 }),
    debt("c1", "Moto", { currency: "COP", balance: 900000, due: dayNum(0), createdAt: t.slice(0, 8) + "01", minPayment: 300000 }),
    debt("c2", "Celular", { currency: "COP", balance: 900000, due: "", createdAt: t.slice(0, 8) + "01", history: [{ amount: 120000, date: t }] }),
  ];
  const h = await open(store);
  const [toPay, paid] = [...h.doc.querySelectorAll(".cal-summary .cal-sum")];
  const lines = (box) => [...box.querySelectorAll(".money-line")].map((x) => x.textContent);
  assert.deepEqual(lines(toPay), [fm(120.5, "USD"), fm(300000, "COP")]);
  assert.deepEqual(lines(paid), [fm(120000, "COP")]);
  assert.match(toPay.textContent, /^Por pagar este mes/);
  assert.match(paid.textContent, /^Pagado este mes/);
  const sum = S.monthSummary(store, +t.slice(0, 4), +t.slice(5, 7), t, {});
  assert.deepEqual(sum.toPay, { USD: 120.5, COP: 300000 }, "nunca se mezclan USD y COP");
});

/* ---------------- Gráfico "Lo que debo" ---------------- */

function owedStore() {
  const t = today();
  return [
    debt("x", "Hipoteca", { balance: 5000, rate: 18, due: dayNum(0), createdAt: t.slice(0, 8) + "01", minPayment: 150 }),
    // Overdue unpaid installment last month (due day = today, created 40 days ago).
    debt("y", "Tarjeta Oro", { balance: 1200, rate: 32, due: dayNum(0), createdAt: plus(-40), minPayment: 60 }),
    debt("z", "Celular", { balance: 300, rate: 10, due: "", minPayment: 25 }),
    debt("w", "Moto", { currency: "COP", balance: 2000000, rate: 25, due: "", minPayment: 180000 }),
  ];
}
const owe = (h) => h.doc.querySelector(".chart-view .owe-panel");
const rowsOf = (h) => [...owe(h).querySelectorAll(".owe-row")];

test("Lo que debo: varias deudas, deuda total y este mes, etiquetas, vencida y consejo", async () => {
  const h = await open(owedStore(), { "deudas-currency-pref-v1": "USD" });
  const { doc } = h;
  // Default: "Lo que debo" visible, "Lo que pagué" hidden; USD/COP selector.
  assert.equal(doc.querySelector('[data-chart-mode="owe"]').getAttribute("aria-pressed"), "true");
  assert.equal(owe(h).hidden, false);
  assert.equal(doc.querySelector(".chart-view .paid-panel").hidden, true);
  assert.equal(doc.querySelector('[data-chart-cur="USD"]').getAttribute("aria-pressed"), "true");
  // This month (default view): installment or minimum.
  assert.equal(doc.querySelector('[data-owe-view="month"]').getAttribute("aria-pressed"), "true");
  assert.deepEqual(rowsOf(h).map((r) => r.querySelector(".owe-amount").textContent), [fm(150, "USD"), fm(60, "USD"), fm(25, "USD")]);
  assert.equal(owe(h).querySelector(".owe-center-total").textContent, fm(235, "USD"));
  // Plan amounts win over the minimum.
  const ymNow = today().slice(0, 7);
  h.win.MPDDPlan.planned = () => ({ ["y|" + ymNow]: 400 });
  h.win.MPDDChart.render();
  assert.equal(rowsOf(h)[0].querySelector("strong").textContent, "Tarjeta Oro");
  assert.equal(rowsOf(h)[0].querySelector(".owe-amount").textContent, fm(400, "USD"));
  // Total debt view: balance of each debt, largest to smallest, with % and rate.
  doc.querySelector('[data-owe-view="total"]').click();
  const rows = rowsOf(h);
  assert.deepEqual(rows.map((r) => r.querySelector("strong").textContent), ["Hipoteca", "Tarjeta Oro", "Celular"]);
  assert.deepEqual(rows.map((r) => r.querySelector(".owe-amount").textContent), [fm(5000, "USD"), fm(1200, "USD"), fm(300, "USD")]);
  assert.deepEqual(rows.map((r) => r.querySelector(".owe-pct").textContent), ["77%", "18%", "5%"]);
  assert.match(rows[1].querySelector(".owe-rate").textContent, /Tasa: 32%/);
  assert.equal(owe(h).querySelector(".owe-center-total").textContent, fm(6500, "USD"));
  assert.doesNotMatch(owe(h).querySelector(".owe-list").textContent, /COP/, "solo la moneda elegida");
  // Tags.
  const tags = (r) => [...r.querySelectorAll(".owe-tag")].map((x) => x.textContent);
  assert.deepEqual(tags(rows[0]), []);
  assert.ok(tags(rows[1]).includes("Más cara"));
  assert.deepEqual(tags(rows[2]), ["Más pequeña"]);
  // Overdue unpaid payment: row in red.
  assert.ok(rows[1].classList.contains("is-overdue"));
  assert.ok(tags(rows[1]).includes("Pago vencido"));
  assert.ok(!rows[0].classList.contains("is-overdue"));
  // Other currency only mentioned, never converted.
  assert.equal(owe(h).querySelector(".owe-other").textContent, "También tienes 1 deuda en COP");
  // Donut: SVG, one color per debt, accessible.
  const svg = owe(h).querySelector("svg.owe-donut");
  assert.equal(svg.getAttribute("role"), "img");
  const desc = doc.getElementById(svg.getAttribute("aria-labelledby"));
  assert.match(desc.textContent, /Deuda total US\$6,500\.00 USD/);
  assert.match(desc.textContent, /Hipoteca: US\$5,000\.00 USD \(77%\)/);
  const colors = [...svg.querySelectorAll(".seg")].map((p) => p.getAttribute("stroke"));
  assert.equal(colors.length, 3);
  assert.equal(new Set(colors).size, 3, "un color distinto por deuda");
  // Tip.
  assert.equal(owe(h).querySelector(".owe-tip-text").textContent, "Tu deuda más grande es Hipoteca, pero la que más te cuesta es Tarjeta Oro.");
  // "Comparar en Métodos" switches to the Métodos tab.
  owe(h).querySelector(".owe-compare").click();
  assert.equal(doc.getElementById("view-methods").hidden, false);
  assert.equal(doc.getElementById("view-chart").hidden, true);
  // COP: only the COP debt; USD debts mentioned.
  doc.querySelector('[data-chart-cur="COP"]').click();
  assert.deepEqual(rowsOf(h).map((r) => r.querySelector(".owe-amount").textContent), [fm(2000000, "COP")]);
  assert.equal(owe(h).querySelector(".owe-other").textContent, "También tienes 3 deudas en USD");
  assert.equal(owe(h).querySelectorAll(".owe-tag").length, 0, "con una sola deuda no hay etiquetas");
  assert.doesNotMatch(owe(h).querySelector(".owe-body").textContent, /USD/);
  // "Lo que pagué" still works.
  doc.querySelector('[data-chart-mode="paid"]').click();
  assert.equal(owe(h).hidden, true);
  assert.equal(doc.querySelector(".chart-view .paid-panel").hidden, false);
  assert.match(doc.querySelector(".chart-view .paid-panel").textContent, /Pagos por periodo/);
});

test("Lo que debo: consejo cuando la más grande es también la más cara, y sin tasas", async () => {
  const h = await open([debt("a", "Grande", { balance: 900, rate: 40, due: "" }), debt("b", "Chica", { balance: 100, rate: 5, due: "" })], { "deudas-currency-pref-v1": "USD" });
  h.doc.querySelector('[data-owe-view="total"]').click();
  assert.equal(owe(h).querySelector(".owe-tip-text").textContent, "Tu deuda más grande, Grande, también es la que más te cuesta.");
  const h2 = await open([debt("a", "Grande", { balance: 900, rate: null, due: "" }), debt("b", "Chica", { balance: 100, rate: null, due: "" })], { "deudas-currency-pref-v1": "USD" });
  h2.doc.querySelector('[data-owe-view="total"]').click();
  assert.match(owe(h2).querySelector(".owe-tip-text").textContent, /^Tu deuda más grande es Grande\. Agrega la tasa de interés/);
  assert.match(rowsOf(h2)[0].textContent, /Tasa pendiente/);
  assert.equal(owe(h2).querySelectorAll(".tag-pricey").length, 0);
  // Pure logic: ties in rate pick the bigger balance.
  const r = S.owed([debt("a", "A", { balance: 100, rate: 20 }), debt("b", "B", { balance: 500, rate: 20 })], { currency: "USD", view: "total", today: today() });
  assert.equal(r.mostExpensiveId, "b");
  assert.equal(r.smallestId, "a");
});

test("Lo que debo: sin datos muestra un mensaje y el botón para agregar, nunca un gráfico vacío", async () => {
  const h = await open([]);
  const panel = owe(h);
  assert.equal(panel.querySelector("svg"), null);
  assert.match(panel.querySelector(".owe-empty").textContent, /Aún no tienes deudas registradas/);
  panel.querySelector(".owe-add").click();
  assert.ok(h.doc.getElementById("dialog").hasAttribute("open"), "abre el formulario de agregar deuda");
  assert.equal(h.doc.getElementById("modalTitle").textContent, "Agregar deuda");
  // Debts only in the other currency.
  const h2 = await open([debt("w", "Moto", { currency: "COP", balance: 500000, due: "" })], { "deudas-currency-pref-v1": "COP" });
  h2.doc.querySelector('[data-chart-cur="USD"]').click();
  assert.equal(owe(h2).querySelector("svg"), null);
  assert.match(owe(h2).querySelector(".owe-empty").textContent, /No tienes deudas en USD\./);
  assert.equal(owe(h2).querySelector(".owe-other").textContent, "También tienes 1 deuda en COP");
  // Everything paid this month: message and a way to see the total, no empty chart.
  const t = today();
  const h3 = await open([debt("u", "Tarjeta", { balance: 300, due: dayNum(0), createdAt: t.slice(0, 8) + "01", minPayment: 50, history: [{ amount: 50, date: t, dueDate: t }] })], { "deudas-currency-pref-v1": "USD" });
  assert.equal(owe(h3).querySelector("svg"), null);
  assert.match(owe(h3).textContent, /No tienes pagos pendientes este mes/);
  [...owe(h3).querySelectorAll("button")].find((b) => b.textContent === "Ver deuda total").click();
  assert.ok(owe(h3).querySelector("svg.owe-donut"));
  // "Lo que pagué" without payments: message, no donut.
  h.doc.querySelector('[data-chart-mode="paid"]').click();
  assert.equal(h.doc.querySelector(".paid-panel svg"), null);
  assert.match(h.doc.querySelector(".paid-panel [role=status]").textContent, /No hay pagos/);
});

test("1.4: textos nuevos traducidos al inglés y sin datos en la consola", async () => {
  const h = await open(owedStore());
  const map = new Map(I18n.entries);
  const missing = [];
  for (const k of ["calendario", "grafico"]) for (const es of Object.values(h.win.MPDDStrings[k])) if (!map.has(es)) missing.push(es);
  assert.deepEqual(missing, []);
  const e = load({ storage: { "deudas-lang-v1": "en", "deudas-currency-pref-v1": "USD", "nando-deudas-v1": JSON.stringify(owedStore()) } });
  await sleep(80);
  e.doc.querySelector('[data-owe-view="total"]').click();
  await sleep(20);
  const chart = e.doc.getElementById("view-chart").textContent;
  assert.match(chart, /What I owe/);
  assert.match(chart, /Your biggest debt is Hipoteca, but the one that costs you the most is Tarjeta Oro\./);
  assert.match(chart, /You also have 1 debt in COP/);
  assert.match(chart, /Most expensive/);
  assert.match(e.doc.getElementById("view-calendar").textContent, /Upcoming payments/);
  assert.match(e.doc.getElementById("view-calendar").textContent, /Overdue by \d+ days?/);
  assert.equal(h.consoleLogs.length + e.consoleLogs.length, 0, "nada en la consola");
  assert.deepEqual(h.errors.concat(e.errors), []);
});
