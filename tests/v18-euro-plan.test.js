/* Pruebas de la versión 1.8: euro (EUR) en toda la app y asistente del plan con tres monedas
   y con los gastos fijos de Inicio (sin volver a preguntar los gastos).
   Ejecutar: cd tests && npm test */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../dist/plan-core.js");
const M = require("../dist/money.js");
const I18n = require("../dist/i18n.js");
const Push = require("../dist/notificaciones.js");
const { load, closeAll, sleep, debt, session, waitFor } = require("./harness");
const { FakeServer } = require("./fake-supabase");
test.afterEach(closeAll);

const ES = { "deudas-lang-v1": "es" };
const DRAFT = "mpdd-plan-draft-v1";
const GASTOS = "mpdd-gastos-fijos-v1";
const gasto = (id, name, amount, currency, extra) => Object.assign({ id, name, amount, currency, frequency: "monthly", day: 5, category: "", note: "", payments: [], createdAt: "2026-11-01" }, extra);

function wizardDriver(h) {
  const { doc, win } = h;
  return {
    click(text, scope) {
      const b = [...doc.querySelectorAll(scope || ".plan-wizard button, #plan-root button")].find((x) => x.textContent.trim() === text);
      if (!b) throw new Error("No hay botón: " + text + " en: " + (doc.querySelector(".plan-wizard") || doc.getElementById("plan-root")).textContent.slice(0, 300));
      b.click();
    },
    set(sel, v) {
      const i = doc.querySelector(sel);
      if (!i) throw new Error("No hay campo " + sel);
      i.value = v;
      i.dispatchEvent(new win.Event("input"));
    },
    step: () => doc.querySelector(".pw-step").textContent,
    body: () => doc.querySelector(".pw-body").textContent,
    prompts: () => [...doc.querySelectorAll(".plan-wizard .pw-body h2, .plan-wizard .pw-body h3")].map((x) => x.textContent.trim()),
  };
}
function signed(uid, extra) {
  return Object.assign({}, ES, { "mpdd-cloud-state-v1": JSON.stringify({ userId: uid, debts: {}, settings: {} }), "mpdd-cloud-active-v1": "1", "sb-fake-auth-token": session("a@ejemplo.test", uid) }, extra);
}

/* ---------------- EUR across the app ---------------- */

test("EUR: formato en Inicio, selectores de moneda con USD, COP y EUR", async () => {
  assert.equal(M.formatMoney(1234.56, "EUR"), "1.234,56 € EUR");
  assert.equal(M.formatEurRate(1.0968), "US$1,0968");
  const store = [debt("e1", "Tarjeta Madrid", { currency: "EUR", balance: 1234.56, initial: 2000, minPayment: 40, due: "12" })];
  const h = load({ storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify(store) }) });
  await sleep(80);
  const { doc } = h;
  // Inicio: the card and the total in euros (never converted).
  assert.match(doc.getElementById("cards").textContent, /1\.234,56 € EUR/);
  assert.deepEqual([...doc.querySelectorAll("#total .amount-line")].map((x) => x.textContent), ["1.234,56 € EUR"]);
  // Más → Moneda (the data-cur switch), the chart, Métodos and the plan wizard offer the three.
  assert.deepEqual([...doc.querySelectorAll("[data-cur]")].map((b) => b.dataset.cur), ["USD", "COP", "EUR"]);
  assert.ok(doc.getElementById("view-more").querySelector('[data-cur="EUR"]'), "Más → Moneda ofrece EUR");
  assert.deepEqual([...doc.querySelectorAll("[data-chart-cur]")].map((b) => b.dataset.chartCur), ["USD", "COP", "EUR"]);
  h.win.MPDDNavigate("methods");
  await sleep(20);
  assert.deepEqual([...doc.querySelectorAll("[data-met-cur]")].map((b) => b.dataset.metCur), ["USD", "COP", "EUR"]);
  // The chart starts in the only currency with debts.
  assert.ok(doc.querySelector('[data-chart-cur="EUR"]').classList.contains("active"));
  // Choosing EUR in Más is kept as the preference (also restored on reload).
  doc.querySelector('[data-cur="EUR"]').click();
  assert.equal(h.win.localStorage.getItem("deudas-currency-pref-v1"), "EUR");
  const again = load({ storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify(store), "deudas-currency-pref-v1": "EUR" }) });
  await sleep(80);
  assert.ok(again.doc.querySelector('[data-cur="EUR"]').classList.contains("active"));
  const w = wizardDriver(again);
  w.click("Empezar");
  assert.deepEqual([...again.doc.querySelectorAll(".pw-switch [data-plan-cur]")].map((b) => b.dataset.planCur), ["USD", "COP", "EUR"]);
  assert.equal(again.doc.querySelector(".pw-switch .active").textContent, "EUR", "moneda de ingresos por defecto: la preferida");
  assert.equal(again.doc.getElementById("plan-income").step, "0.01", "EUR usa centavos como USD");
  // English: amounts keep their format; the heading is translated.
  assert.equal(I18n.translateText("Deudas en EUR", "en"), "Debts in EUR");
  assert.deepEqual(h.net.fetch, []);
});

test("Inicio: total por moneda en orden USD, COP, EUR y solo las que existen", async () => {
  const store = [
    debt("e1", "Euro", { currency: "EUR", balance: 500, initial: 1000 }),
    debt("c1", "Pesos", { currency: "COP", balance: 2000000, initial: 4000000 }),
    debt("u1", "Dólares", { currency: "USD", balance: 300, initial: 600 }),
  ];
  const h = load({ storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify(store) }) });
  await sleep(80);
  const { doc } = h;
  assert.deepEqual([...doc.querySelectorAll("#total .amount-line")].map((x) => x.textContent), ["US$300.00 USD", "$2.000.000 COP", "500,00 € EUR"]);
  assert.deepEqual([...doc.querySelectorAll("#total .amount-line")].map((x) => x.dataset.currency), ["USD", "COP", "EUR"]);
  assert.deepEqual([...doc.querySelectorAll("#cards .cur-heading")].map((x) => x.textContent), ["Deudas en USD", "Deudas en COP", "Deudas en EUR"]);
  assert.equal(doc.querySelectorAll("#progress-lines .cur-progress").length, 3);
  assert.deepEqual([...doc.querySelectorAll("#milestones .milestone-cur")].map((x) => x.textContent), ["USD", "COP", "EUR"]);
  assert.equal(doc.querySelectorAll("#paid .stat-line").length, 3);
  // Only USD and EUR: no COP line.
  const h2 = load({ storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify([store[0], store[2]]) }) });
  await sleep(80);
  assert.deepEqual([...h2.doc.querySelectorAll("#total .amount-line")].map((x) => x.textContent), ["US$300.00 USD", "500,00 € EUR"]);
  assert.deepEqual([...h2.doc.querySelectorAll("#cards .cur-heading")].map((x) => x.textContent), ["Deudas en USD", "Deudas en EUR"]);
  // Calendar: totals per currency, the euro after COP.
  const t = new Date().toLocaleDateString("en-CA");
  const cal = [debt("e1", "Euro", { currency: "EUR", balance: 500, minPayment: 25, due: "28" }), debt("u1", "Dólares", { balance: 300, minPayment: 30, due: "28" }), debt("c1", "Pesos", { currency: "COP", balance: 900000, minPayment: 90000, due: "28" })];
  const h3 = load({ storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify(cal) }) });
  await sleep(80);
  h3.win.MPDDCalendar.show(+t.slice(0, 4), +t.slice(5, 7));
  const lines = [...h3.doc.querySelectorAll(".cal-summary .cal-sum")[0].querySelectorAll(".money-line")].map((x) => x.textContent);
  assert.deepEqual(lines, ["US$30.00 USD", "$90.000 COP", "25,00 € EUR"]);
});

test("formulario de deuda: guarda en EUR; las deudas guardadas no cambian; respaldo y .ics con EUR", async () => {
  const old = [debt("u1", "Visa", { balance: 120.5 }), debt("c1", "Éxito", { currency: "COP", balance: 900000 })];
  const h = load({ storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify(old) }) });
  await sleep(80);
  const { doc, win } = h;
  doc.getElementById("add").click();
  const sel = doc.getElementById("currency");
  assert.deepEqual([...sel.options].map((o) => o.textContent), ["USD", "COP", "EUR"]);
  assert.match(doc.getElementById("fields").textContent, /EUR para euros/);
  doc.getElementById("name").value = "Préstamo Lisboa";
  doc.getElementById("balance").value = "850.75";
  doc.getElementById("minPayment").value = "35";
  doc.getElementById("due").value = "9";
  sel.value = "EUR";
  doc.getElementById("form").dispatchEvent(new win.Event("submit", { cancelable: true }));
  await sleep(30);
  const saved = h.debts();
  const eur = saved.find((d) => d.name === "Préstamo Lisboa");
  assert.equal(eur.currency, "EUR");
  assert.equal(eur.balance, 850.75);
  assert.deepEqual(saved.filter((d) => d.id !== eur.id), old, "las deudas anteriores no cambian");
  assert.match(doc.getElementById("cards").textContent, /850,75 € EUR/);
  // With EUR selected in Más, a new debt starts in EUR.
  doc.querySelector('[data-cur="EUR"]').click();
  doc.getElementById("add").click();
  assert.equal(doc.getElementById("currency").value, "EUR");
  doc.getElementById("cancel").click();
  // A debt with payments cannot change currency (message for EUR).
  const withPay = Object.assign({}, eur, { history: [{ id: "p1", date: "2026-11-01", amount: 10 }] });
  const h2 = load({ storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify([withPay]) }) });
  await sleep(80);
  h2.doc.querySelector('[data-edit="' + eur.id + '"]').click();
  h2.doc.getElementById("currency").value = "USD";
  h2.doc.getElementById("form").dispatchEvent(new h2.win.Event("submit", { cancelable: true }));
  assert.equal(h2.doc.getElementById("error").textContent, "Esta deuda tiene pagos registrados en EUR. Para usar otra moneda, crea una deuda nueva.");
  // Backup: an EUR debt goes out and comes back unchanged.
  const raw = win.DebtBackupPlus.create(win.localStorage, h.debts());
  const back = win.DebtBackupPlus.validate(raw);
  assert.equal((back.debts || back).find((d) => d.id === eur.id).currency, "EUR");
  // .ics: the amount in euros.
  const { text } = Push.buildICS([eur], { today: "2026-11-16", now: new Date(Date.UTC(2026, 10, 16)), lang: "es", format: M.formatMoney });
  assert.match(text.replace(/\r\n /g, ""), /Pago mínimo: 35\\,00 € EUR/, "coma escapada como pide el formato .ics");
});

test("Métodos con deudas en EUR y USD: usa la tasa del euro (BCE), aproximada", async () => {
  const server = new FakeServer();
  server.eur.body.usdPorEur = 1.1;
  const store = [debt("e1", "Euro", { currency: "EUR", balance: 1000, rate: 20, minPayment: 100 }), debt("u1", "Visa", { balance: 600, rate: 25, minPayment: 40 })];
  const h = load({ config: "test", server, storage: Object.assign({}, ES, { "deudas-currency-pref-v1": "USD", "nando-deudas-v1": JSON.stringify(store) }) });
  await sleep(60);
  h.win.MPDDNavigate("methods");
  const root = h.doc.getElementById("metodos-root");
  await waitFor(() => /Tasa del euro:/.test(root.textContent), { label: "tasa del euro en Métodos" });
  assert.match(root.textContent, /Tasa del euro: 1 EUR = US\$1,1000 · Banco Central Europeo · 15 de noviembre de 2026/);
  // 100 EUR × 1.1 + 40 = 150 USD.
  assert.match(root.textContent, /Pago mensual \(suma de tus mínimos\): US\$150\.00 USD aproximado/);
  assert.equal(server.trmCalls, 0, "sin COP no se consulta la TRM");
  // In EUR: the USD debt is converted.
  root.querySelector('[data-met-cur="EUR"]').click();
  assert.match(root.textContent, /€ EUR/);
});

/* ---------------- plan wizard with three currencies ---------------- */

test("plan en EUR con deudas en COP y USD: TRM y BCE, cada pago en su moneda, totales por moneda y columnas guardadas", async () => {
  const server = new FakeServer();
  server.eur.body.usdPorEur = 1.0968;
  const uid = server.addUser("a@ejemplo.test", "x12345678");
  const store = [debt("c1", "Tarjeta Éxito", { currency: "COP", balance: 2000000, rate: 30, minPayment: 100000, due: "20" }), debt("u1", "Visa", { balance: 500, rate: 20, minPayment: 50, due: "10" })];
  const h = load({ config: "test", server, storage: signed(uid, { "deudas-currency-pref-v1": "EUR", "nando-deudas-v1": JSON.stringify(store) }) });
  await waitFor(() => h.win.MPDDCloud.status().state === "synced");
  const w = wizardDriver(h);
  await waitFor(() => /Arma tu plan/.test(h.doc.getElementById("plan-root").textContent));
  w.click("Empezar");
  await waitFor(() => server.trmCalls === 1 && server.eurCalls === 1, { label: "consulta TRM y euro" });
  assert.match(w.body(), /En qué moneda quieres ver tu plan/);
  const planSwitch = h.doc.querySelectorAll(".pw-switch")[1];
  assert.equal(planSwitch.querySelector(".active").textContent, "EUR", "por defecto, la moneda de los ingresos");
  w.set("#plan-income", "3000");
  w.click("Siguiente");
  w.set("#plan-exp-0", "1000");
  w.click("Siguiente");
  await waitFor(() => /Tasa del euro:/.test(w.body()) && /TRM de hoy/.test(w.body()), { label: "dos tarjetas" });
  assert.equal(h.doc.querySelectorAll(".pw-body .trm-card").length, 2, "una tarjeta por tasa");
  assert.match(w.body(), /Tasa del euro: 1 EUR = US\$1,0968 · Banco Central Europeo · 15 de noviembre de 2026/);
  assert.match(w.body(), /TRM de hoy: 1 USD = \$4\.000,00 COP/);
  // 100,000 COP = 25 USD = 22.79 EUR (approx.).
  assert.match(w.body(), /≈ 22,79 € EUR/);
  assert.match(w.body(), /Total de mínimos: [\d.,]+ € EUR aproximado/);
  w.click("Siguiente");
  assert.match(h.doc.querySelector(".pw-free-amount").textContent, /€ EUR$/);
  w.set("#plan-extra", "100");
  w.click("Siguiente");
  const body = w.body();
  assert.match(body, /Tarjeta Éxito\$[\d.]+ COP \(≈ [\d.,]+ € EUR\)/, "pago en COP con su equivalente en EUR");
  assert.match(body, /Visa.*US\$[\d,.]+ USD \(≈ [\d.,]+ € EUR\)/);
  const lines = [...h.doc.querySelectorAll(".plan-total .plan-total-line")].map((x) => x.textContent);
  assert.equal(lines.length, 2);
  assert.match(lines[0], /USD$/);
  assert.match(lines[1], /COP$/);
  assert.match(h.doc.querySelector(".plan-approx").textContent, /≈ [\d.,]+ € EUR \(aproximado\)/);
  w.click("Empezar mi plan");
  await waitFor(() => server.plans.get(uid), { label: "plan guardado" });
  const row = server.plans.get(uid);
  assert.equal(row.income_currency, "EUR");
  assert.equal(row.plan_currency, "EUR");
  assert.equal(row.fx_rate, 4000);
  assert.equal(row.fx_type, "oficial");
  assert.equal(row.eur_rate, 1.0968);
  assert.equal(row.eur_type, "oficial");
  assert.equal(row.eur_date, "2026-11-15");
  assert.equal(row.items.find((i) => i.debtId === "c1").currency, "COP");
  assert.equal(row.items.find((i) => i.debtId === "u1").currency, "USD");
  // Plan tab: the rate used, read-only.
  await waitFor(() => /Tasa del euro usada en tu plan: 1 EUR = US\$1,0968/.test(h.doc.getElementById("plan-root").textContent), { label: "tasa usada" });
  // Home totals are never converted.
  assert.deepEqual([...h.doc.querySelectorAll("#total .amount-line")].map((x) => x.textContent), ["US$500.00 USD", "$2.000.000 COP"]);
  // The same plan core result.
  const r = P.buildPlan({ income: 3000, incomeCurrency: "EUR", planCurrency: "EUR", expenses: [{ amount: 1000 }], extra: 100, method: "avalanche", fx: { cop: 4000, eur: 1.0968 }, debts: store, today: "2026-11-16" });
  assert.equal(r.fxEur, 1.0968);
});

test("una sola moneda o sin EUR: no se consulta la tasa del euro", async () => {
  const server = new FakeServer();
  const store = [debt("c1", "Tarjeta", { currency: "COP", balance: 1000000, rate: 20, minPayment: 80000 }), debt("u1", "Visa", { balance: 500, rate: 20, minPayment: 25 })];
  const h = load({ config: "test", server, storage: Object.assign({}, ES, { "deudas-currency-pref-v1": "COP", "nando-deudas-v1": JSON.stringify(store) }) });
  await sleep(60);
  const w = wizardDriver(h);
  w.click("Empezar");
  await waitFor(() => server.trmCalls === 1);
  await sleep(30);
  assert.equal(server.eurCalls, 0);
  // Switching the plan to EUR then needs the euro rate too.
  h.doc.querySelectorAll(".pw-switch")[1].querySelector('[data-plan-cur="EUR"]').click();
  await waitFor(() => server.eurCalls === 1, { label: "tasa del euro al elegir EUR" });
});

test("tasa del euro sin conexión o desactualizada: 'Última tasa disponible' con su fecha", async () => {
  const server = new FakeServer();
  server.eur = { status: 200, body: { fecha: "2026-11-13", usdPorEur: 1.045, fuente: "Banco Central Europeo", desactualizada: true } };
  const store = [debt("e1", "Euro", { currency: "EUR", balance: 800, rate: 15, minPayment: 40 })];
  const h = load({ config: "test", server, storage: Object.assign({}, ES, { "deudas-currency-pref-v1": "USD", "nando-deudas-v1": JSON.stringify(store) }) });
  await sleep(60);
  const w = wizardDriver(h);
  w.click("Empezar");
  w.set("#plan-income", "3000");
  w.click("Siguiente");
  w.click("Siguiente");
  await waitFor(() => /Última tasa disponible/.test(w.body()), { label: "tasa desactualizada" });
  assert.match(w.body(), /Última tasa disponible: 13 de noviembre de 2026 · 1 EUR = US\$1,0450/);
  assert.equal(server.trmCalls, 0, "sin COP no se consulta la TRM");
  // No network: the last rate saved on the device, flagged as outdated.
  const server2 = new FakeServer();
  server2.eur = { status: 0 };
  const h2 = load({ config: "test", server: server2, storage: Object.assign({}, ES, { "deudas-currency-pref-v1": "USD", "nando-deudas-v1": JSON.stringify(store), "mpdd-eur-cache-v1": JSON.stringify({ usdPorEur: 1.04, fecha: "2026-11-12", fuente: "Banco Central Europeo" }) }) });
  await sleep(60);
  const w2 = wizardDriver(h2);
  w2.click("Empezar");
  w2.set("#plan-income", "3000");
  w2.click("Siguiente");
  w2.click("Siguiente");
  await waitFor(() => /Última tasa disponible/.test(w2.body()));
  assert.match(w2.body(), /Última tasa disponible: 12 de noviembre de 2026 · 1 EUR = US\$1,0400/);
  // No rate at all: ask for one before going on.
  const server3 = new FakeServer();
  server3.eur = { status: 0 };
  const h3 = load({ config: "test", server: server3, storage: Object.assign({}, ES, { "deudas-currency-pref-v1": "USD", "nando-deudas-v1": JSON.stringify(store) }) });
  await sleep(60);
  const w3 = wizardDriver(h3);
  w3.click("Empezar");
  w3.set("#plan-income", "3000");
  w3.click("Siguiente");
  w3.click("Siguiente");
  await waitFor(() => /No pudimos obtener la tasa del euro/.test(w3.body()), { label: "pide una tasa" });
  assert.ok(h3.doc.getElementById("plan-fx-eur"));
  w3.click("Siguiente");
  assert.equal(w3.step(), "Paso 3 de 5", "no avanza sin tasa");
});

test("tasa del euro personalizada: se usa y se guarda como personalizada", async () => {
  const server = new FakeServer();
  const uid = server.addUser("a@ejemplo.test", "x12345678");
  const store = [debt("e1", "Euro", { currency: "EUR", balance: 800, rate: 15, minPayment: 40, due: "8" }), debt("u1", "Visa", { balance: 500, rate: 30, minPayment: 25, due: "25" })];
  const h = load({ config: "test", server, storage: signed(uid, { "deudas-currency-pref-v1": "USD", "nando-deudas-v1": JSON.stringify(store) }) });
  await waitFor(() => h.win.MPDDCloud.status().state === "synced");
  const w = wizardDriver(h);
  w.click("Empezar");
  w.set("#plan-income", "2500");
  w.click("Siguiente");
  w.click("Siguiente");
  await waitFor(() => /Tasa del euro:/.test(w.body()));
  w.click("Usar otra tasa", ".eur-card button");
  w.set("#plan-fx-eur", "0.1");
  w.click("Usar esta tasa", ".eur-card button");
  assert.match(w.body(), /Escribe una tasa válida, por ejemplo 1\.08\./);
  w.set("#plan-fx-eur", "1.1");
  w.click("Usar esta tasa", ".eur-card button");
  assert.match(w.body(), /Tasa del euro personalizada: 1 EUR = US\$1,1000/);
  // 40 EUR × 1.1 = 44 USD.
  assert.match(w.body(), /≈ US\$44\.00 USD/);
  w.click("Siguiente");
  w.click("Siguiente");
  w.click("Empezar mi plan");
  await waitFor(() => server.plans.get(uid), { label: "plan guardado" });
  const row = server.plans.get(uid);
  assert.equal(row.eur_type, "personalizada");
  assert.equal(row.eur_rate, 1.1);
  assert.equal(row.fx_rate, null, "sin COP no se guarda TRM");
  assert.equal(row.fx_type, null);
});

test("la tasa del euro cambió más de 3 %: aviso en la pestaña Plan y actualización", async () => {
  const server = new FakeServer();
  const uid = server.addUser("a@ejemplo.test", "x12345678");
  const store = [debt("e1", "Euro", { currency: "EUR", balance: 800, rate: 15, minPayment: 40 }), debt("u1", "Visa", { balance: 500, rate: 30, minPayment: 25 })];
  const ym = new Date().toLocaleDateString("en-CA").slice(0, 7);
  server.plans.set(uid, { user_id: uid, income: 3000, income_currency: "USD", plan_currency: "USD", expenses: [{ key: "vivienda", amount: 900 }], extra: 0, method: "avalanche", fx_rate: null, fx_date: null, fx_type: null, eur_rate: 1.0, eur_date: "2026-10-01", eur_type: "oficial", plan_month: ym + "-01", items: [] });
  const h = load({ config: "test", server, storage: signed(uid, { "nando-deudas-v1": JSON.stringify(store) }) });
  const tab = () => h.doc.getElementById("plan-root").textContent;
  await waitFor(() => /La tasa del euro cambió/.test(tab()), { label: "aviso euro" });
  assert.match(tab(), /Tasa del euro usada en tu plan: 1 EUR = US\$1,0000 · Banco Central Europeo · 1 de octubre de 2026/);
  assert.doesNotMatch(tab(), /La TRM cambió/);
  [...h.doc.querySelectorAll("#plan-root button")].find((b) => b.textContent === "Actualizar").click();
  await waitFor(() => server.plans.get(uid).eur_rate === 1.05, { label: "plan actualizado" });
  assert.deepEqual(server.plans.get(uid).expenses, [{ key: "vivienda", amount: 900 }], "conserva los gastos");
  await waitFor(() => !/La tasa del euro cambió/.test(tab()));
});

/* ---------------- step 2 and the fixed expenses ---------------- */

test("paso 2 con gastos fijos: no los vuelve a pedir, total convertido, desglose, Otros y Editar", async () => {
  const server = new FakeServer();
  const store = [debt("u1", "Visa", { balance: 2000, rate: 24, minPayment: 80, due: "10" })];
  const gastos = [gasto("g1", "Agua", 100, "USD"), gasto("g2", "Luz Bogotá", 200000, "COP"), gasto("g3", "Gas Madrid", 50, "EUR")];
  const h = load({ config: "test", server, storage: Object.assign({}, ES, { "deudas-currency-pref-v1": "USD", "nando-deudas-v1": JSON.stringify(store), [GASTOS]: JSON.stringify(gastos) }) });
  await sleep(60);
  const w = wizardDriver(h);
  w.click("Empezar");
  w.set("#plan-income", "4000");
  w.click("Siguiente");
  await waitFor(() => server.trmCalls === 1 && server.eurCalls === 1, { label: "tasas para los gastos fijos" });
  await waitFor(() => /US\$202\.50 USD/.test(w.body()), { label: "total convertido" });
  assert.equal(h.doc.querySelector(".pw-body h2").textContent, "Tus gastos del mes");
  assert.equal(h.doc.getElementById("plan-exp-0"), null, "no pide la lista otra vez");
  assert.doesNotMatch(w.body(), /¿Cuánto gastas en lo básico\?/);
  // 100 + 200,000 / 4000 + 50 × 1.05 = 202.50 USD, approximate.
  assert.match(w.body(), /Tus gastos fijos del mes: US\$202\.50 USD aproximado/);
  assert.equal(h.doc.querySelector(".pw-fixed-breakdown").textContent, "US$100.00 USD · $200.000 COP · 50,00 € EUR");
  w.set("#plan-others", "300");
  assert.equal(h.doc.querySelector(".pw-step-total").textContent, "US$502.50 USD");
  w.click("Siguiente");
  w.click("Siguiente");
  // Step 4: the expenses = fixed + others.
  assert.match(w.body(), /Gastos básicos− US\$502\.50 USD/);
  // Live update while the wizard is open.
  w.click("‹ Atrás");
  w.click("‹ Atrás");
  h.win.MPDDGastos.save({ name: "HOA", amount: 97.5, currency: "USD", frequency: "monthly", day: 1, category: "hoa" });
  assert.match(w.body(), /Tus gastos fijos del mes: US\$300\.00 USD/);
  assert.equal(h.doc.getElementById("plan-others").value, "300", "conserva Otros");
  // Editar: keeps the draft and goes to Inicio → Gastos fijos.
  w.click("Editar");
  assert.equal(h.doc.querySelector(".plan-wizard"), null);
  await sleep(80);
  assert.equal(h.doc.getElementById("view-home").hidden, false, "va a Inicio");
  const kept = JSON.parse(h.win.localStorage.getItem(DRAFT));
  assert.equal(kept.draft.step, 2);
  assert.equal(kept.draft.reason, "gastos");
  assert.equal(kept.draft.others, "300");
  // Back in Plan (no account needed): continue at step 2 with the data.
  await waitFor(() => /Continuar con tu plan/.test(h.doc.getElementById("plan-root").textContent), { label: "ofrece continuar" });
  w.click("Continuar con tu plan");
  assert.equal(w.step(), "Paso 2 de 5");
  assert.equal(h.doc.getElementById("plan-others").value, "300");
  assert.equal(h.doc.getElementById("plan-income") , null);
  w.click("‹ Atrás");
  assert.equal(h.doc.getElementById("plan-income").value, "4000");
});

test("paso 2 sin gastos fijos: se pide la lista una vez y se ofrece guardarla como gastos fijos", async () => {
  const server = new FakeServer();
  const uid = server.addUser("a@ejemplo.test", "x12345678");
  const store = [debt("c1", "Tarjeta", { currency: "COP", balance: 3000000, rate: 30, minPayment: 150000, due: "15" })];
  const h = load({ config: "test", server, storage: signed(uid, { "deudas-currency-pref-v1": "COP", "nando-deudas-v1": JSON.stringify(store) }) });
  await waitFor(() => h.win.MPDDCloud.status().state === "synced");
  const w = wizardDriver(h);
  w.click("Empezar");
  w.set("#plan-income", "6000000");
  w.click("Siguiente");
  assert.equal(h.doc.querySelector(".pw-body h2").textContent, "¿Cuánto gastas en lo básico?");
  assert.match(w.body(), /Guardar estos gastos como gastos fijos/);
  assert.match(w.body(), /Puedes cambiar el día de pago en Inicio/);
  w.set("#plan-exp-0", "1500000");
  w.set("#plan-exp-1", "800000");
  const box = h.doc.getElementById("plan-save-fixed");
  box.checked = true;
  box.dispatchEvent(new h.win.Event("change"));
  w.click("Siguiente");
  assert.equal(w.step(), "Paso 3 de 5");
  assert.match(w.body(), /guardamos tus gastos como gastos fijos/);
  const list = h.win.MPDDGastos.list();
  assert.deepEqual(JSON.parse(JSON.stringify(list.map((g) => [g.name, g.amount, g.currency, g.day, g.frequency]))), [["Vivienda", 1500000, "COP", 1, "monthly"]], "solo las cuentas (vivienda); la comida no se vuelve un gasto fijo");
  // Going back: the step now shows the fixed expenses, it does not ask again.
  w.click("‹ Atrás");
  assert.equal(h.doc.getElementById("plan-exp-0"), null);
  assert.match(w.body(), /Tus gastos fijos del mes: \$1\.500\.000 COP/);
  assert.equal(h.doc.querySelector(".pw-body input").value, "800000", "la comida pasa a «Otros gastos del mes»");
  assert.doesNotMatch(w.body(), /aproximado/);
  w.click("Siguiente");
  w.click("Siguiente");
  assert.match(w.body(), /Gastos básicos− \$2\.300\.000 COP/);
  w.click("Siguiente");
  w.click("Empezar mi plan");
  await waitFor(() => server.plans.get(uid), { label: "plan guardado" });
  assert.equal(server.plans.get(uid).expenses.map((e) => e.amount).reduce((a, b) => a + b, 0), 2300000, "el total del plan no cambia (1.500.000 fijos + 800.000 otros)");
  // Plan tab: how much of the income goes to fixed expenses.
  await waitFor(() => /De tus ingresos, \$1\.500\.000 COP se van en gastos fijos\./.test(h.doc.getElementById("plan-root").textContent), { label: "parte de los ingresos" });
  // "Ajustar mi plan": the fixed expenses are not asked again either.
  w.click("Ajustar mi plan");
  w.click("Siguiente");
  assert.equal(h.doc.getElementById("plan-exp-0"), null);
  assert.match(w.body(), /Tus gastos fijos del mes: \$1\.500\.000 COP/);
  // Not checked: nothing is saved.
  const h2 = load({ config: "test", server: new FakeServer(), storage: Object.assign({}, ES, { "deudas-currency-pref-v1": "COP", "nando-deudas-v1": JSON.stringify(store) }) });
  await sleep(60);
  const w2 = wizardDriver(h2);
  w2.click("Empezar");
  w2.set("#plan-income", "6000000");
  w2.click("Siguiente");
  w2.set("#plan-exp-0", "1500000");
  w2.click("Siguiente");
  assert.equal(h2.win.MPDDGastos.list().length, 0);
});

/* Walks the whole wizard and records each prompt (h2/h3) of each step. */
function walk(h, w, { income, setExpenses }) {
  const seen = [];
  const take = () => seen.push(...w.prompts());
  take();
  w.set("#plan-income", income);
  w.click("Siguiente");
  take();
  if (setExpenses) setExpenses();
  w.click("Siguiente");
  take();
  w.click("Siguiente");
  take();
  w.click("Siguiente");
  take();
  return seen;
}
const countOnce = (list) => {
  const counts = {};
  for (const p of list) counts[p] = (counts[p] || 0) + 1;
  return Object.entries(counts).filter(([, n]) => n !== 1);
};

for (const multi of [false, true])
  for (const fixed of [false, true])
    test("asistente completo (" + (multi ? "USD+COP+EUR" : "una moneda") + ", " + (fixed ? "con" : "sin") + " gastos fijos): cada pregunta aparece una sola vez, también tras Atrás", async () => {
      const server = new FakeServer();
      const store = multi
        ? [debt("u1", "Visa", { balance: 1500, rate: 22, minPayment: 60, due: "5" }), debt("c1", "Éxito", { currency: "COP", balance: 2000000, rate: 28, minPayment: 120000, due: "15" }), debt("e1", "Madrid", { currency: "EUR", balance: 900, rate: 12, minPayment: 45, due: "20" })]
        : [debt("u1", "Visa", { balance: 1500, rate: 22, minPayment: 60, due: "5" })];
      const storage = Object.assign({}, ES, { "deudas-currency-pref-v1": "USD", "nando-deudas-v1": JSON.stringify(store) });
      if (fixed) storage[GASTOS] = JSON.stringify([gasto("g1", "Agua", 120, "USD")]);
      const h = load({ config: "test", server, storage });
      await sleep(60);
      const w = wizardDriver(h);
      w.click("Empezar");
      if (multi) await waitFor(() => server.trmCalls === 1 && server.eurCalls === 1, { label: "tasas" });
      await sleep(60); // the rates arrive
      const first = walk(h, w, { income: "6000", setExpenses: () => (fixed ? w.set("#plan-others", "400") : w.set("#plan-exp-0", "400")) });
      assert.deepEqual(countOnce(first), [], "preguntas repetidas: " + JSON.stringify(first));
      const expenseQuestion = first.filter((p) => p === "¿Cuánto gastas en lo básico?").length;
      assert.equal(expenseQuestion, fixed ? 0 : 1, "la pregunta de gastos solo sin gastos fijos");
      if (fixed) assert.ok(first.includes("Tus gastos del mes"));
      assert.equal(first.filter((p) => p === "¿En qué moneda quieres ver tu plan?").length, multi ? 1 : 0);
      const total5 = h.doc.querySelector(".plan-total").textContent;
      // Back to the start and forward again: same questions, values kept, nothing asked anew.
      for (let i = 0; i < 4; i++) w.click("‹ Atrás");
      assert.equal(w.step(), "Paso 1 de 5");
      assert.equal(h.doc.getElementById("plan-income").value, "6000");
      const again = [];
      again.push(...w.prompts());
      w.click("Siguiente");
      again.push(...w.prompts());
      if (fixed) assert.equal(h.doc.getElementById("plan-others").value, "400");
      else assert.equal(h.doc.getElementById("plan-exp-0").value, "400");
      for (let i = 0; i < 3; i++) {
        w.click("Siguiente");
        again.push(...w.prompts());
      }
      assert.deepEqual(again, first);
      assert.deepEqual(countOnce(again), []);
      assert.equal(h.doc.querySelector(".plan-total").textContent, total5, "mismo plan");
      if (multi) assert.equal(h.doc.querySelectorAll(".plan-view .trm-card").length, 2, "tarjeta de TRM y del euro");
    });
