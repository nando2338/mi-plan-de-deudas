/* Pure tests for the fixed expenses (1.8), the euro format and the 3-currency conversion. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("../dist/gastos-core.js");
const M = require("../dist/money.js");
const P = require("../dist/plan-core.js");

const base = (o) => Object.assign({ id: "g1", name: "Agua", amount: 100, currency: "USD", frequency: "monthly", day: 10, month: null, category: "agua", note: "", payments: [], createdAt: "2026-01-01" }, o);

test("euro: formato español 1.234,56 € con la etiqueta EUR; orden USD, COP, EUR", () => {
  assert.equal(M.formatMoney(1234.56, "EUR"), "1.234,56 € EUR");
  assert.equal(M.formatMoney(5, "EUR"), "5,00 € EUR");
  assert.equal(M.formatMoney(1234567.891, "EUR"), "1.234.567,89 € EUR");
  assert.equal(M.formatMoney(1250, "USD"), "US$1,250.00 USD", "USD sigue igual");
  assert.equal(M.formatMoney(1250000, "COP"), "$1.250.000 COP", "COP sigue igual");
  assert.deepEqual(M.ordered({ EUR: 1, COP: 1, USD: 1 }), ["USD", "COP", "EUR"]);
  assert.deepEqual(M.totalsByCurrency([{ currency: "EUR", v: 10.5 }, { currency: "EUR", v: 0.25 }], (x) => x.v), { EUR: 10.75 });
});

test("conversión con tres monedas: siempre pasando por el dólar", () => {
  const fx = { cop: 4000, eur: 1.05 }; // 1 USD = 4.000 COP; 1 EUR = 1,05 USD
  assert.equal(P.convert(100, "EUR", "USD", fx), 105);
  assert.equal(P.convert(105, "USD", "EUR", fx), 100);
  assert.equal(P.convert(100, "EUR", "COP", fx), 420000);
  assert.equal(P.convert(420000, "COP", "EUR", fx), 100);
  assert.equal(P.convert(4000, "COP", "USD", 4000), 1, "un número sigue siendo la TRM (planes 1.3–1.7)");
  assert.throws(() => P.convert(1, "EUR", "COP", { cop: 4000 }), (e) => e.missingFx.includes("eur"));
  assert.deepEqual(P.ratesNeeded("EUR", "EUR", [{ currency: "EUR", balance: 1 }]), [], "todo en euros: sin tasas");
  assert.deepEqual(P.ratesNeeded("USD", "USD", [{ currency: "EUR", balance: 1 }]), ["eur"]);
  assert.deepEqual(P.ratesNeeded("COP", "EUR", [{ currency: "USD", balance: 1 }]), ["cop", "eur"]);
});

test("plan con deudas en euros y en pesos, plan en euros", () => {
  const r = P.buildPlan({
    income: 3000, incomeCurrency: "EUR", planCurrency: "EUR", expenses: [{ amount: 1000 }], extra: 100, method: "avalanche", fx: { cop: 4000, eur: 1.05 }, today: "2026-11-18",
    debts: [{ id: "e", name: "Tarjeta EUR", currency: "EUR", balance: 2000, rate: 20, minPayment: 60, due: "25" }, { id: "c", name: "Tarjeta COP", currency: "COP", balance: 4200000, rate: 30, minPayment: 210000, due: "20" }],
  });
  assert.equal(r.planCurrency, "EUR");
  const cop = r.items.find((i) => i.debtId === "c");
  assert.equal(cop.currency, "COP", "cada pago en su moneda original");
  assert.equal(r.fxEur, 1.05);
  assert.equal(r.fx, 4000);
  assert.ok(Math.abs(r.minimums - (60 + 50)) < 0.01, "210.000 COP = 50 €");
});

test("gastos: conversión a mensual y totales por moneda (un anual de 1.200 = 100 al mes)", () => {
  const list = [
    base({ id: "a", amount: 1200, frequency: "annual", month: 4, currency: "USD" }),
    base({ id: "b", amount: 300, frequency: "quarterly", month: 1, currency: "USD" }),
    base({ id: "c", amount: 600, frequency: "semiannual", month: 6, currency: "EUR" }),
    base({ id: "d", amount: 80000, frequency: "monthly", currency: "COP" }),
    base({ id: "e", amount: 999, deleted: true }),
  ];
  assert.equal(G.monthlyEquivalent(list[0]), 100);
  assert.deepEqual(G.monthlyTotals(list), { USD: 200, EUR: 100, COP: 80000 });
  assert.deepEqual(G.dueInMonthTotals(list, 2026, 4), { USD: 1500, COP: 80000 }, "abril: se paga el anual y el trimestral");
  assert.deepEqual(G.dueInMonthTotals(list, 2026, 5), { COP: 80000 });
});

test("gastos: meses de pago de cada frecuencia y día 31 en meses cortos", () => {
  const q = base({ frequency: "quarterly", month: 2 });
  assert.deepEqual([1, 2, 3, 4, 5, 8, 11].map((m) => G.isDueMonth(q, 2026, m)), [false, true, false, false, true, true, true]);
  const s = base({ frequency: "semiannual", month: 11 });
  assert.deepEqual([5, 11, 12].map((m) => G.isDueMonth(s, 2026, m)), [true, true, false]);
  const occ = G.occurrences([base({ day: 31 })], { from: "2026-02-01", to: "2026-04-30", today: "2026-02-01" });
  assert.deepEqual(occ.map((o) => o.dueDate), ["2026-02-28", "2026-03-31", "2026-04-30"]);
});

test("gastos: estados, pago por período y resaltado igual que las deudas", () => {
  const today = "2026-11-18";
  let g = base({ day: 18, createdAt: "2026-11-01" });
  let o = G.currentOccurrence(g, today);
  assert.equal(o.dueDate, "2026-11-18");
  assert.equal(o.status, "dueToday");
  assert.deepEqual(G.dueLevel(o.dueDate, today, false), { level: "red", days: 0, kind: "today" });
  g = G.markPaid(g, "2026-11", "2026-11-18");
  o = G.currentOccurrence(g, today);
  assert.equal(o.dueDate, "2026-12-18", "pagado: el siguiente es el de diciembre");
  assert.equal(G.dueLevel(o.dueDate, today, false), null, "a más de 7 días no se resalta");
  assert.equal(G.dueLevel("2026-11-19", today).level, "yellow");
  assert.equal(G.dueLevel("2026-11-21", today).level, "blue");
  assert.equal(G.dueLevel("2026-11-16", today).kind, "overdue");
  // Overdue and unpaid from last month comes first.
  const late = base({ day: 5, createdAt: "2026-09-01" });
  assert.equal(G.currentOccurrence(late, today).dueDate, "2026-09-05");
  assert.equal(G.currentOccurrence(late, today).status, "overdue");
  // Annual: the payment month is highlighted.
  const tax = base({ frequency: "annual", month: 11, day: 20, amount: 1200, createdAt: "2026-06-01" });
  assert.equal(G.currentOccurrence(tax, today).dueDate, "2026-11-20");
  assert.equal(G.dueLevel("2026-11-20", today).level, "blue");
  assert.equal(G.unmarkPaid(g, "2026-11").payments.length, 0);
});

test("gastos: validación, limpieza y filas de la base (ida y vuelta)", () => {
  assert.deepEqual(G.validate(base()), []);
  assert.deepEqual(G.validate(base({ name: " ", amount: 0, currency: "ARS", day: 32 })), ["name", "amount", "currency", "day"]);
  assert.deepEqual(G.validate(base({ frequency: "annual", month: null })), ["month"], "anual necesita el mes");
  const g = base({ id: "x1", amount: 1234.567, currency: "EUR", frequency: "annual", month: 3, note: "Predial", payments: [{ period: "2026-03", date: "2026-03-02", amount: 1234.57 }], updatedAt: "2026-11-18T10:00:00.000Z" });
  const clean = G.sanitize([g, { id: "x1" }, { nope: 1 }, base({ id: "bad", amount: -1 })]);
  assert.equal(clean.length, 1);
  assert.equal(clean[0].amount, 1234.57);
  const row = G.toRow(clean[0]);
  assert.equal(row.frecuencia, "anual");
  assert.equal(row.moneda, "EUR");
  assert.deepEqual(G.fromRow(row), clean[0]);
});

test("gastos: sincronización, gana el cambio más reciente y respeta lo borrado", () => {
  const a = base({ id: "a", amount: 10, updatedAt: "2026-11-18T10:00:00Z" });
  const aNew = base({ id: "a", amount: 20, updatedAt: "2026-11-18T11:00:00Z" });
  const b = base({ id: "b", updatedAt: "2026-11-18T09:00:00Z" });
  const bDeleted = { id: "b", deleted: true, updatedAt: "2026-11-18T12:00:00Z" };
  const m = G.merge([a, b], [aNew, bDeleted]);
  assert.equal(m.find((x) => x.id === "a").amount, 20);
  assert.equal(m.find((x) => x.id === "b").deleted, true);
  assert.equal(G.active(m).length, 1);
  assert.equal(G.merge([aNew], [a]).find((x) => x.id === "a").amount, 20, "lo viejo no pisa lo nuevo");
});

test("gastos: categorías sugeridas y propias con ícono", () => {
  assert.deepEqual(G.CATEGORIES.map((c) => c[1]), ["Agua", "Luz", "Gas", "HOA", "Impuestos", "Cámaras de seguridad", "Corte de césped"]);
  assert.deepEqual(G.categoryInfo("impuestos", [], "en"), { key: "impuestos", label: "Taxes", icon: "🧾", custom: false });
  assert.deepEqual(G.categoryInfo("c-1", [{ key: "c-1", label: "Internet", icon: "📶" }], "es"), { key: "c-1", label: "Internet", icon: "📶", custom: true });
  assert.equal(G.categoryInfo("c-2", [{ key: "c-2", label: "Raro", icon: "<b>" }], "es").icon, "⭐", "solo íconos de la lista");
});
