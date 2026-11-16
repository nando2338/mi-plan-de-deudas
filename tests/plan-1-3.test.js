/* Pruebas de la versión 1.3: plan de pagos, asistente y TRM.
   Ejecutar: cd tests && npm test */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const P = require("../dist/plan-core.js");
const I18n = require("../dist/i18n.js");
const { load, closeAll, sleep, debt, session, waitFor } = require("./harness");
const { FakeServer } = require("./fake-supabase");
test.afterEach(closeAll);

const ES = { "deudas-lang-v1": "es" };
const TODAY = "2026-11-16";
const base = (over) => Object.assign({ income: 0, incomeCurrency: "USD", planCurrency: "USD", expenses: [], extra: 0, method: "avalanche", fx: null, debts: [], today: TODAY }, over);

/* Independent reference: month-by-month with rollover, same rules as the spec. */
function reference(debts, extra, order) {
  const a = debts.map((d) => ({ ...d }));
  const budget = a.reduce((s, d) => s + d.min, 0) + extra;
  let months = 0,
    interest = 0;
  while (a.some((d) => d.balance > 0.004) && months < 600) {
    months++;
    for (const d of a) if (d.balance > 0) {
      const c = Math.round(d.balance * (d.rate / 100 / 12) * 100) / 100;
      d.balance += c;
      interest += c;
    }
    let left = budget;
    for (const d of a) if (d.balance > 0) {
      const p = Math.min(d.min, d.balance, left);
      d.balance -= p;
      left -= p;
    }
    for (const d of order(a.filter((x) => x.balance > 0))) {
      const p = Math.min(left, d.balance);
      d.balance -= p;
      left -= p;
    }
  }
  return { months, interest: Math.round(interest * 100) / 100 };
}

test("cálculo: fecha libre de deudas e intereses ahorrados", () => {
  // No interest: 1000 at 100/month = 10 months; with 100 extra = 5 months.
  const r0 = P.buildPlan(base({ income: 2000, extra: 100, debts: [{ id: "a", name: "A", currency: "USD", balance: 1000, rate: 0, minPayment: 100 }] }));
  assert.equal(r0.payoffYmWithoutExtra, "2027-08"); // Nov 2026 + 9 months
  assert.equal(r0.payoffYm, "2027-03");
  assert.equal(r0.interestSaved, 0);
  // With interest: compare against the independent reference.
  const debts = [{ id: "a", name: "A", currency: "USD", balance: 2500, rate: 24, minPayment: 75 }];
  const r = P.buildPlan(base({ income: 3000, expenses: [{ amount: 1000 }], extra: 150, debts }));
  const ref = reference([{ balance: 2500, rate: 24, min: 75 }], 150, (x) => x);
  const refBase = reference([{ balance: 2500, rate: 24, min: 75 }], 0, (x) => x);
  assert.equal(r.payoffYm, P.monthAdd("2026-11", ref.months - 1));
  assert.equal(r.payoffYmWithoutExtra, P.monthAdd("2026-11", refBase.months - 1));
  assert.ok(Math.abs(r.interestSaved - (refBase.interest - ref.interest)) < 1, "intereses ahorrados");
  assert.ok(r.interestSaved > 0);
  // Free money and leftover.
  assert.equal(r.free, 3000 - 1000 - 75);
  assert.equal(r.leftover, r.free - 150);
  // Rollover: when a debt is paid off its payment goes to the next one.
  const roll = P.simulate([{ id: "s", balance: 100, rate: 0, min: 100 }, { id: "b", balance: 1000, rate: 0, min: 100 }], 0, "avalanche", "2026-11");
  assert.equal(roll.months, 6); // month 1: both 100; then 200/month on b: 900 → 5 more months... (100+100*5=600? b gets 100 + 200*... ) checked below
  const refRoll = reference([{ balance: 100, rate: 0, min: 100 }, { balance: 1000, rate: 0, min: 100 }], 0, (x) => x);
  assert.equal(roll.months, refRoll.months);
});

test("avalancha frente a bola de nieve", () => {
  const debts = [
    { id: "small", name: "Pequeña", currency: "USD", balance: 500, rate: 10, minPayment: 25 },
    { id: "big", name: "Cara", currency: "USD", balance: 3000, rate: 30, minPayment: 90 },
  ];
  const ava = P.buildPlan(base({ income: 2000, extra: 200, debts }));
  const snow = P.buildPlan(base({ income: 2000, extra: 200, debts, method: "snowball" }));
  assert.equal(ava.items.find((i) => i.first).debtId, "big", "avalancha: mayor interés primero");
  assert.equal(snow.items.find((i) => i.first).debtId, "small", "bola de nieve: menor saldo primero");
  assert.equal(ava.items.find((i) => i.debtId === "big").payment, 290);
  assert.equal(snow.items.find((i) => i.debtId === "small").payment, 225);
  assert.ok(ava.interest < snow.interest, "avalancha paga menos intereses");
  const refAva = reference([{ balance: 500, rate: 10, min: 25 }, { balance: 3000, rate: 30, min: 90 }], 200, (a) => a.sort((x, y) => y.rate - x.rate));
  assert.ok(Math.abs(ava.interest - refAva.interest) < 1);
  // Snowball compares balances converted to the plan currency.
  const mixed = [
    { id: "cop", name: "COP", currency: "COP", balance: 3000000, rate: 20, minPayment: 100000 }, // = 750 USD at 4000
    { id: "usd", name: "USD", currency: "USD", balance: 600, rate: 20, minPayment: 30 },
  ];
  assert.equal(P.buildPlan(base({ income: 2000, extra: 100, debts: mixed, method: "snowball", fx: 4000 })).items.find((i) => i.first).debtId, "usd");
  assert.equal(P.buildPlan(base({ income: 2000, extra: 100, debts: mixed, method: "snowball", fx: 6000 })).items.find((i) => i.first).debtId, "cop"); // 500 USD
});

test("dinero libre negativo: sin barra, mensaje amable", async () => {
  const r = P.buildPlan(base({ income: 100, expenses: [{ amount: 90 }], extra: 50, debts: [{ id: "a", name: "A", currency: "USD", balance: 500, rate: 10, minPayment: 30 }] }));
  assert.equal(r.free, -20);
  assert.equal(r.extra, 0);
  const h = load({ storage: Object.assign({}, ES, { "deudas-currency-pref-v1": "USD", "nando-deudas-v1": JSON.stringify([debt("a", "A", { balance: 500, rate: 10, minPayment: 30 })]) }) });
  await sleep(60);
  const w = wizardDriver(h);
  w.click("Empezar");
  w.set("#plan-income", "100");
  w.click("Siguiente");
  w.set("#plan-exp-0", "90");
  w.click("Siguiente");
  w.click("Siguiente");
  const body = h.doc.querySelector(".pw-body").textContent;
  assert.match(body, /Tus gastos y mínimos superan tus ingresos/);
  assert.equal(h.doc.querySelector("#plan-extra"), null, "no se muestra la barra");
  assert.ok(h.doc.querySelector(".pw-free.negative"));
});

function wizardDriver(h) {
  const { doc, win } = h;
  return {
    click(text) {
      const b = [...doc.querySelectorAll(".plan-wizard button, #plan-root button")].find((x) => x.textContent.trim() === text);
      if (!b) throw new Error("No hay botón: " + text + " en: " + (doc.querySelector(".plan-wizard") || doc.getElementById("plan-root")).textContent.slice(0, 200));
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
  };
}

test("todo en una moneda: no se pregunta la moneda del plan ni se muestra la TRM, sin red", async () => {
  const server = new FakeServer();
  const h = load({ config: "test", server, storage: Object.assign({}, ES, { "deudas-currency-pref-v1": "COP", "nando-deudas-v1": JSON.stringify([debt("c1", "Tarjeta", { currency: "COP", balance: 2000000, rate: 30, minPayment: 120000, due: "20" })]) }) });
  await sleep(60);
  const w = wizardDriver(h);
  w.click("Empezar");
  assert.ok(h.doc.body.classList.contains("plan-wizard-open"), "oculta la barra de pestañas");
  assert.equal(w.step(), "Paso 1 de 5");
  assert.doesNotMatch(w.body(), /En qué moneda quieres ver tu plan/);
  w.set("#plan-income", "4000000");
  w.click("Siguiente");
  w.click("Siguiente");
  assert.equal(h.doc.querySelector(".trm-card"), null, "sin tarjeta de TRM");
  assert.doesNotMatch(w.body(), /aproximado/);
  w.click("Siguiente");
  w.set("#plan-extra", "100000");
  w.click("Siguiente");
  assert.match(w.body(), /PAGA PRIMERO/);
  assert.doesNotMatch(w.body(), /≈/);
  assert.equal(server.trmCalls, 0);
  assert.deepEqual(h.net.fetch, [], "ninguna solicitud de red");
  // Back button.
  w.click("‹ Atrás");
  assert.equal(w.step(), "Paso 4 de 5");
  h.doc.querySelector(".pw-close").click();
  assert.equal(h.doc.querySelector(".plan-wizard"), null);
  assert.ok(!h.doc.body.classList.contains("plan-wizard-open"));
});

test("deudas en USD y COP: plan en COP y plan en USD, cada pago en su moneda con su equivalente", async () => {
  const server = new FakeServer();
  const store = [debt("c1", "Tarjeta Éxito", { currency: "COP", balance: 3000000, rate: 28, minPayment: 150000, due: "15" }), debt("u1", "Visa", { balance: 1200, rate: 22, minPayment: 40, due: "5" })];
  const h = load({ config: "test", server, storage: Object.assign({}, ES, { "deudas-currency-pref-v1": "COP", "nando-deudas-v1": JSON.stringify(store) }) });
  await sleep(60);
  const w = wizardDriver(h);
  w.click("Empezar");
  await waitFor(() => server.trmCalls === 1, { label: "consulta TRM" });
  assert.match(w.body(), /En qué moneda quieres ver tu plan/);
  w.set("#plan-income", "6000000");
  w.click("Siguiente");
  w.set("#plan-exp-0", "2000000");
  w.click("Siguiente");
  await waitFor(() => /TRM de hoy/.test(w.body()));
  assert.match(w.body(), /TRM de hoy: 1 USD = \$4\.000,00 COP · Superintendencia Financiera · 15 de noviembre de 2026/);
  assert.match(w.body(), /≈ \$160\.000 COP/, "equivalente en letra pequeña");
  assert.match(w.body(), /Total de mínimos: \$310\.000 COP aproximado/);
  assert.match(w.body(), /aproximados\. Tu banco puede cobrar una tasa distinta/);
  w.click("Siguiente");
  w.set("#plan-extra", "200000");
  w.click("Siguiente");
  const cop = w.body();
  assert.match(cop, /PAGA PRIMERO.*Tarjeta Éxito\$350\.000 COP/);
  assert.match(cop, /Visa.*US\$40\.00 USD \(≈ \$160\.000 COP\)/);
  assert.match(cop, /Total a pagar este mesUS\$40\.00 USD\$350\.000 COP≈ \$510\.000 COP \(aproximado\)/);
  // Same debts, plan in USD.
  for (let i = 0; i < 4; i++) w.click("‹ Atrás");
  [...h.doc.querySelectorAll(".pw-switch")][1].querySelector('[data-plan-cur="USD"]').click();
  w.click("Siguiente");
  w.click("Siguiente");
  w.click("Siguiente");
  assert.match(w.body(), /Cada mes te quedan libres/);
  assert.match(h.doc.querySelector(".pw-free-amount").textContent, /US\$/);
  w.set("#plan-extra", "50");
  w.click("Siguiente");
  const usd = w.body();
  assert.match(usd, /Tarjeta Éxito\$350\.000 COP \(≈ US\$87\.50 USD\)/, "pago en COP con equivalente en USD");
  assert.match(usd, /Visa.*US\$40\.00 USD/);
  assert.match(usd, /≈ US\$127\.50 USD \(aproximado\)/);
  // Home totals are never converted.
  assert.deepEqual([...h.doc.querySelectorAll("#total .amount-line")].map((x) => x.textContent), ["US$1,200.00 USD", "$3.000.000 COP"]);
});

test("ingresos en COP y deudas solo en USD: pide moneda del plan y usa la TRM", async () => {
  const server = new FakeServer();
  const h = load({ config: "test", server, storage: Object.assign({}, ES, { "deudas-currency-pref-v1": "COP", "nando-deudas-v1": JSON.stringify([debt("u1", "Visa", { balance: 1000, rate: 24, minPayment: 50, due: "10" })]) }) });
  await sleep(60);
  const w = wizardDriver(h);
  w.click("Empezar");
  assert.match(w.body(), /En qué moneda quieres ver tu plan/);
  assert.equal(h.doc.querySelectorAll(".pw-switch")[1].querySelector(".active").textContent, "COP", "por defecto, la de los ingresos");
  w.set("#plan-income", "4000000");
  w.click("Siguiente");
  w.set("#plan-exp-0", "1000000");
  w.click("Siguiente");
  await waitFor(() => /TRM de hoy/.test(w.body()));
  w.click("Siguiente");
  // 4,000,000 − 1,000,000 − 50 USD × 4000 = 2,800,000
  assert.equal(h.doc.querySelector(".pw-free-amount").textContent, "$2.800.000 COP");
  const r = P.buildPlan(base({ income: 4000000, incomeCurrency: "COP", planCurrency: "COP", expenses: [{ amount: 1000000 }], fx: 4000, debts: [{ id: "u1", name: "Visa", currency: "USD", balance: 1000, rate: 24, minPayment: 50 }] }));
  assert.equal(r.fxUsed, true);
  assert.equal(r.free, 2800000);
});

test("falla de la API de la TRM: usa la última guardada (desactualizada)", async () => {
  const server = new FakeServer();
  server.trm = { status: 200, body: { fecha: "2026-11-13", valor: 3950, fuente: "Superintendencia Financiera de Colombia", desactualizada: true } };
  const store = [debt("c1", "Tarjeta", { currency: "COP", balance: 1000000, rate: 20, minPayment: 80000 }), debt("u1", "Visa", { balance: 500, rate: 20, minPayment: 25 })];
  const h = load({ config: "test", server, storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify(store) }) });
  await sleep(60);
  const w = wizardDriver(h);
  w.click("Empezar");
  w.set("#plan-income", "3000");
  w.click("Siguiente");
  w.click("Siguiente");
  await waitFor(() => /Última TRM disponible/.test(w.body()), { label: "TRM desactualizada" });
  assert.match(w.body(), /Última TRM disponible: 13 de noviembre de 2026 · 1 USD = \$3\.950,00 COP/);
  // Function unreachable: the app falls back to the last TRM it received, also flagged as outdated.
  const h2 = load({ config: "test", server, storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify(store), "mpdd-trm-cache-v1": JSON.stringify({ valor: 3900, fecha: "2026-11-12", fuente: "Superintendencia Financiera de Colombia" }) }) });
  server.trm = { status: 0 };
  await sleep(60);
  const w2 = wizardDriver(h2);
  w2.click("Empezar");
  w2.set("#plan-income", "3000");
  w2.click("Siguiente");
  w2.click("Siguiente");
  await waitFor(() => /Última TRM disponible/.test(w2.body()));
  assert.match(w2.body(), /12 de noviembre de 2026 · 1 USD = \$3\.900,00 COP/);
  // The edge function itself is tested with Deno in tests/trm (API down → last stored).
  assert.ok(fs.existsSync(path.join(__dirname, "trm", "trm.deno.ts")));
});

test("tasa personalizada: la tarjeta dice 'Tasa personalizada' y se guarda como tal", async () => {
  const server = new FakeServer();
  const uid = server.addUser("a@ejemplo.test", "x12345678");
  const store = [debt("c1", "Tarjeta", { currency: "COP", balance: 1000000, rate: 20, minPayment: 80000, due: "20" }), debt("u1", "Visa", { balance: 500, rate: 30, minPayment: 25, due: "25" })];
  const h = load({ config: "test", server, storage: Object.assign({}, ES, { "deudas-currency-pref-v1": "USD", "nando-deudas-v1": JSON.stringify(store), "mpdd-cloud-active-v1": "1", "sb-fake-auth-token": session("a@ejemplo.test", uid) }) });
  // 1.4: empty account + local debts -> automatic upload (no question).
  await waitFor(() => h.win.MPDDCloud.status().state === "synced");
  const w = wizardDriver(h);
  w.click("Empezar");
  w.set("#plan-income", "2500");
  w.click("Siguiente");
  w.click("Siguiente");
  await waitFor(() => /TRM de hoy/.test(w.body()));
  w.click("Usar otra tasa");
  w.set("#plan-fx", "4200");
  w.click("Usar esta tasa");
  assert.match(w.body(), /Tasa personalizada: 1 USD = \$4\.200,00 COP/);
  w.click("Siguiente");
  w.click("Siguiente");
  w.click("Empezar mi plan");
  await waitFor(() => server.plans.get(uid), { label: "plan guardado" });
  const row = server.plans.get(uid);
  assert.equal(row.fx_type, "personalizada");
  assert.equal(row.fx_rate, 4200);
  assert.equal(row.plan_currency, "USD");
  assert.equal(row.income, 2500);
  assert.equal(row.income_currency, "USD");
  assert.equal(row.method, "avalanche");
  assert.ok(Array.isArray(row.items) && row.items.length === 2);
  assert.equal(row.items.find((i) => i.debtId === "c1").currency, "COP", "cada pago en su moneda");
});

test("guardar con cuenta: plan en Supabase, pestaña Plan, calendario y recordatorios", async () => {
  const server = new FakeServer();
  const uid = server.addUser("a@ejemplo.test", "x12345678");
  const store = [debt("c1", "Tarjeta", { currency: "COP", balance: 2000000, rate: 30, minPayment: 120000, due: "28" })];
  const h = load({ config: "test", server, storage: Object.assign({}, ES, { "deudas-currency-pref-v1": "COP", "nando-deudas-v1": JSON.stringify(store), "mpdd-cloud-active-v1": "1", "sb-fake-auth-token": session("a@ejemplo.test", uid) }) });
  // 1.4: empty account + local debts -> automatic upload (no question).
  await waitFor(() => h.win.MPDDCloud.status().state === "synced");
  const w = wizardDriver(h);
  await waitFor(() => /Arma tu plan en 2 minutos/.test(h.doc.getElementById("plan-root").textContent));
  w.click("Empezar");
  w.set("#plan-income", "5000000");
  w.click("Siguiente");
  w.set("#plan-exp-0", "1500000");
  w.click("+ Agregar otro gasto");
  w.set("#plan-exp-name-5", "Gimnasio");
  w.set("#plan-exp-5", "100000");
  assert.match(w.body(), /Total de gastos básicos: \$1\.600\.000 COP/);
  w.click("Siguiente");
  w.click("Siguiente");
  w.set("#plan-extra", "380000");
  w.click("Siguiente");
  w.click("Empezar mi plan");
  await waitFor(() => !h.doc.querySelector(".plan-wizard"), { label: "cierra el asistente" });
  const row = server.plans.get(uid);
  assert.equal(row.extra, 380000);
  assert.deepEqual(row.expenses, [{ key: "vivienda", amount: 1500000 }, { key: "custom", label: "Gimnasio", amount: 100000 }]);
  assert.equal(row.fx_rate, null);
  assert.equal(row.fx_type, null);
  assert.equal(row.items[0].payment, 500000);
  // Plan tab shows the plan and "Ajustar mi plan".
  const tab = h.doc.getElementById("plan-root").textContent;
  assert.match(tab, /Tu plan para/);
  assert.match(tab, /\$500\.000 COP/);
  assert.match(tab, /quedó guardado/);
  assert.ok([...h.doc.querySelectorAll("#plan-root button")].some((b) => b.textContent === "Ajustar mi plan"));
  // Calendar uses the planned amount for this month.
  const ym = new Date().toLocaleDateString("en-CA").slice(0, 7);
  assert.equal(h.win.MPDDPlan.planned()["c1|" + ym], 500000);
  assert.match(h.doc.querySelector(".cal-summary").textContent, /\$500\.000 COP/);
  // Reminder created for the debt.
  const rem = JSON.parse(h.win.localStorage.getItem("nando-recordatorios-v1"));
  assert.equal(rem.c1.paymentDay, 28);
  assert.equal(rem.c1.paymentEnabled, true);
  // "Ajustar mi plan" opens the assistant with the data filled in.
  w.click("Ajustar mi plan");
  assert.equal(h.doc.getElementById("plan-income").value, "5000000");
  w.click("Siguiente");
  assert.equal(h.doc.getElementById("plan-exp-name-5").value, "Gimnasio");
  // Another device loads the same plan from the cloud.
  const b = load({ config: "test", server, storage: Object.assign({}, ES, { "mpdd-cloud-active-v1": "1", "sb-fake-auth-token": session("a@ejemplo.test", uid) }) });
  await waitFor(() => /Tu plan para/.test(b.doc.getElementById("plan-root").textContent), { label: "plan en otro dispositivo" });
});

test("sin cuenta: se puede armar el plan, y al guardarlo se pide iniciar sesión", async () => {
  const server = new FakeServer();
  const h = load({ config: "test", server, storage: Object.assign({}, ES, { "deudas-currency-pref-v1": "USD", "nando-deudas-v1": JSON.stringify([debt("a", "A", { balance: 800, rate: 18, minPayment: 40 })]) }) });
  await sleep(60);
  assert.match(h.doc.getElementById("plan-root").textContent, /para guardarlo necesitas iniciar sesión/);
  const w = wizardDriver(h);
  w.click("Empezar");
  w.set("#plan-income", "1500");
  w.click("Siguiente");
  w.click("Siguiente");
  w.click("Siguiente");
  w.click("Siguiente");
  w.click("Empezar mi plan");
  assert.match(h.doc.querySelector(".pw-status").textContent, /necesitas una cuenta/);
  assert.equal(server.plans.size, 0);
  assert.equal(h.net.createClient, 0, "sin sesión no se carga Supabase");
  // 1.4: only the temporary draft (with its timestamp, expires in 24 h) stays on the device so a
  // sign-in link opened in another tab can continue it; the plan itself is not saved locally.
  assert.deepEqual(Object.keys(Object.fromEntries(Object.entries(h.win.localStorage))).filter((k) => /plan/.test(k)), ["mpdd-plan-draft-v1"], "no se guarda solo en el dispositivo");
  assert.equal(typeof JSON.parse(h.win.localStorage.getItem("mpdd-plan-draft-v1")).savedAt, "number");
  [...h.doc.querySelectorAll(".pw-status button")].find((b) => b.textContent === "Crear cuenta o iniciar sesión").click();
  assert.equal(h.doc.querySelector(".plan-wizard"), null);
  // 1.4: routed through MPDDAccount.ask("plan") -> sign-in / create-account dialog.
  const auth = h.doc.getElementById("account-auth-dialog");
  assert.ok(auth.hasAttribute("open"), "abre el diálogo de cuenta");
  assert.match(auth.textContent, /Crea tu cuenta para guardar tu plan/);
});

test("faltan tasa o mínimo: se piden en la fila y se guardan en la deuda", async () => {
  const h = load({ storage: Object.assign({}, ES, { "deudas-currency-pref-v1": "USD", "nando-deudas-v1": JSON.stringify([debt("a", "Sin datos", { balance: 800, rate: null })]) }) });
  await sleep(60);
  const w = wizardDriver(h);
  w.click("Empezar");
  w.set("#plan-income", "1500");
  w.click("Siguiente");
  w.click("Siguiente");
  assert.ok(h.doc.getElementById("plan-rate-a") && h.doc.getElementById("plan-min-a"));
  w.click("Siguiente");
  assert.match(w.body(), /Completa la tasa y el pago mínimo/);
  w.set("#plan-rate-a", "19.5");
  w.set("#plan-min-a", "45");
  w.click("Siguiente");
  assert.equal(w.step(), "Paso 4 de 5");
  assert.equal(h.debts()[0].rate, 19.5);
  assert.equal(h.debts()[0].minPayment, 45);
});

test("sin deudas: mensaje y botón para agregar una", async () => {
  const h = load({ storage: ES });
  await sleep(60);
  const w = wizardDriver(h);
  w.click("Empezar");
  w.set("#plan-income", "1000");
  w.click("Siguiente");
  w.click("Siguiente");
  assert.match(w.body(), /Aún no tienes deudas registradas/);
  w.click("Agregar una deuda");
  assert.ok(h.doc.getElementById("dialog").hasAttribute("open"));
});

test("la TRM cambió más de 3 %: aviso en la pestaña Plan y actualización", async () => {
  assert.equal(P.fxChanged(4000, 4100), false);
  assert.equal(P.fxChanged(4000, 4130), true);
  assert.equal(P.fxChanged(4000, 3870), true);
  const server = new FakeServer();
  const uid = server.addUser("a@ejemplo.test", "x12345678");
  const store = [debt("c1", "Tarjeta", { currency: "COP", balance: 1000000, rate: 20, minPayment: 80000 }), debt("u1", "Visa", { balance: 500, rate: 30, minPayment: 25 })];
  server.plans.set(uid, { user_id: uid, income: 3000000, income_currency: "COP", plan_currency: "COP", expenses: [], extra: 0, method: "avalanche", fx_rate: 3800, fx_date: "2026-10-01", fx_type: "oficial", plan_month: "2026-10-01", items: [] });
  // The device was already linked (no first-login question).
  const h = load({ config: "test", server, storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify(store), "mpdd-cloud-state-v1": JSON.stringify({ userId: uid, debts: {}, settings: {} }), "mpdd-cloud-active-v1": "1", "sb-fake-auth-token": session("a@ejemplo.test", uid) }) });
  await waitFor(() => /La TRM cambió/.test(h.doc.getElementById("plan-root").textContent), { label: "aviso TRM" });
  assert.match(h.doc.getElementById("plan-root").textContent, /TRM usada en tu plan: 1 USD = \$3\.800,00 COP/);
  [...h.doc.querySelectorAll("#plan-root button")].find((b) => b.textContent === "Actualizar").click();
  await waitFor(() => server.plans.get(uid).fx_rate === 4000, { label: "plan actualizado" });
  await waitFor(() => !/La TRM cambió/.test(h.doc.getElementById("plan-root").textContent));
});

test("la pantalla de Capacidad mensual ya no existe; Métodos conserva el comparador (automático desde 1.4)", async () => {
  const h = load({ storage: ES });
  await sleep(60);
  for (const id of ["budget-fields", "budget-calc", "budget-output", "budget-scenario", "scenario-income"]) assert.equal(h.doc.getElementById(id), null, id);
  assert.ok(h.doc.querySelector("#view-plan #plan-root"));
  assert.ok(h.doc.querySelector("#view-methods #metodos-root"), "comparador de Métodos");
  for (const id of ["sim-calc", "sim-load", "sim-budget", "simulation-rows"]) assert.equal(h.doc.getElementById(id), null, "sin formulario manual: " + id);
  assert.deepEqual(h.errors, []);
});

test("textos del plan traducidos al inglés y versión 1.3", async () => {
  const h = load({ storage: ES });
  await sleep(60);
  const map = new Map(I18n.entries);
  const missing = Object.values(h.win.MPDDStrings.plan).filter((s) => !map.has(s));
  assert.deepEqual(missing, []);
  const e = load({ storage: { "deudas-lang-v1": "en", "nando-deudas-v1": JSON.stringify([debt("a", "Card", { balance: 800, rate: 18, minPayment: 40 })]) } });
  await sleep(80);
  assert.match(e.doc.getElementById("plan-root").textContent, /Build your plan in 2 minutes/);
  wizardDriver(e).click("Start");
  await sleep(30);
  assert.match(e.doc.querySelector(".plan-wizard").textContent, /Step 1 of 5/);
  assert.match(e.doc.querySelector(".plan-wizard").textContent, /How much money comes in each month\?/);
  const sw = fs.readFileSync(path.join(__dirname, "..", "dist", "sw.js"), "utf8");
  assert.match(sw, /mpd-cache-v1\.[3-9]/);
  for (const f of ["/plan-core.js", "/plan-ui.js", "/plan.css"]) assert.ok(sw.includes("'" + f + "'"), f);
});

test("revisión: el calendario no muestra 'Monto por definir' junto a un monto", async () => {
  const t = new Date().toLocaleDateString("en-CA");
  const h = load({ storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify([debt("c1", "Tarjeta", { currency: "COP", minPayment: 150000, due: String(+t.slice(8, 10)), createdAt: t.slice(0, 8) + "01" })]) }) });
  await sleep(60);
  h.doc.querySelector(`.cal-day[data-date="${t}"]`).click();
  const txt = h.doc.querySelector(".cal-detail").textContent;
  assert.match(txt, /\$150\.000 COP/);
  assert.doesNotMatch(txt, /Monto por definir/);
});

test("revisión: con plan en otra moneda el pago nunca queda por debajo del mínimo; fechas pasadas van al mes siguiente", () => {
  const r = P.buildPlan(base({ income: 2000, incomeCurrency: "USD", planCurrency: "USD", fx: 3917.37, today: "2026-11-15", debts: [{ id: "c", name: "C", currency: "COP", balance: 3000000, rate: 28, minPayment: 150000, due: "10" }, { id: "u", name: "U", currency: "USD", balance: 900, rate: 20, minPayment: 30, due: "20" }] }));
  const c = r.items.find((i) => i.debtId === "c");
  assert.ok(c.payment >= 150000, "pago " + c.payment);
  assert.equal(c.dueDate, "2026-12-10", "el 10 ya pasó: siguiente fecha");
  assert.equal(r.items.find((i) => i.debtId === "u").dueDate, "2026-11-20");
  // Minimum larger than what is owed only counts the balance (+ interest).
  const small = P.buildPlan(base({ income: 1000, extra: 0, debts: [{ id: "s", name: "S", currency: "USD", balance: 20, rate: 0, minPayment: 100 }, { id: "b", name: "B", currency: "USD", balance: 500, rate: 10, minPayment: 50 }] }));
  assert.equal(small.minimums, 70);
  assert.equal(small.items.some((i) => i.first), false, "sin extra no hay PAGA PRIMERO");
  // No debts: nothing to save.
  assert.equal(P.buildPlan(base({ income: 1000 })).hasDebts, false);
});

test("revisión: la barra llega al dinero libre exacto y el plan sin guardar se recupera tras iniciar sesión", async () => {
  const server = new FakeServer();
  const uid = server.addUser("a@ejemplo.test", "x12345678");
  const h = load({ config: "test", server, storage: Object.assign({}, ES, { "deudas-currency-pref-v1": "COP", "nando-deudas-v1": JSON.stringify([debt("c1", "Tarjeta", { currency: "COP", balance: 5000000, rate: 25, minPayment: 63500, due: "28" })]) }) });
  await sleep(60);
  const w = wizardDriver(h);
  w.click("Empezar");
  w.set("#plan-income", "1500000");
  w.click("Siguiente");
  w.click("Siguiente");
  w.click("Siguiente");
  w.click("Todo");
  assert.match(w.body(), /Te queda al mes para imprevistos: \$0 COP/);
  w.click("Siguiente");
  w.click("Empezar mi plan");
  [...h.doc.querySelectorAll(".pw-status button")].find((b) => b.textContent === "Crear cuenta o iniciar sesión").click();
  [...h.doc.querySelectorAll("#account-auth-dialog button")].find((b) => b.textContent === "Iniciar sesión").click();
  h.doc.getElementById("acc-login-email").value = "a@ejemplo.test";
  h.doc.getElementById("acc-login-password").value = "x12345678";
  h.doc.querySelector("#account-auth-dialog form").dispatchEvent(new h.win.Event("submit", { cancelable: true }));
  await waitFor(() => h.win.MPDDCloud.status().state === "synced", { label: "subida automática" });
  await waitFor(() => /Continuar con tu plan/.test(h.doc.getElementById("plan-root").textContent), { label: "ofrece continuar" });
  w.click("Continuar con tu plan");
  assert.equal(w.step(), "Paso 5 de 5");
  w.click("Empezar mi plan");
  await waitFor(() => server.plans.get(uid));
  assert.equal(server.plans.get(uid).extra, 1436500);
  assert.equal(h.win.sessionStorage.getItem("mpdd-plan-draft-v1"), null, "el borrador temporal se borra al guardar");
});
