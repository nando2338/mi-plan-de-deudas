/* Pruebas de la versión 1.4: pestaña Métodos (comparador automático) y pendientes de 1.3
   (borrador entre pestañas, Escape en el asistente, redondeo con TRM).
   Ejecutar: cd tests && npm test */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../dist/plan-core.js");
const M = require("../dist/money.js");
const I18n = require("../dist/i18n.js");
const { load, closeAll, sleep, debt, session, waitFor } = require("./harness");
const { FakeServer } = require("./fake-supabase");
test.afterEach(closeAll);

const ES = { "deudas-lang-v1": "es" };
const DRAFT = "mpdd-plan-draft-v1";
const ym = () => new Date().toLocaleDateString("en-CA").slice(0, 7);
const root = (h) => h.doc.getElementById("metodos-root");
const text = (h) => root(h).textContent;
async function openMethods(h) {
  await sleep(60);
  h.win.MPDDNavigate("methods");
  await sleep(20);
}
function clickText(h, scope, label) {
  const b = [...h.doc.querySelectorAll(scope + " button")].find((x) => x.textContent.trim() === label);
  if (!b) throw new Error("No hay botón: " + label);
  b.click();
  return b;
}
const cardOf = (h, method) => root(h).querySelector(`.met-card[data-method="${method}"]`);
/* Signed-in device already linked to the account (no first-login question). */
function signedStorage(uid, extra) {
  return Object.assign({}, ES, { "mpdd-cloud-state-v1": JSON.stringify({ userId: uid, debts: {}, settings: {} }), "mpdd-cloud-active-v1": "1", "sb-fake-auth-token": session("a@ejemplo.test", uid) }, extra);
}
const planRow = (uid, over) => Object.assign({ user_id: uid, income: 3000, income_currency: "USD", plan_currency: "USD", expenses: [], extra: 200, method: "avalanche", fx_rate: null, fx_date: null, fx_type: null, plan_month: ym() + "-01", items: [] }, over);

test("Métodos: carga sola las deudas y el pago del plan (mínimos + extra), sin campos para escribir", async () => {
  const server = new FakeServer();
  const uid = server.addUser("a@ejemplo.test", "x12345678");
  const store = [debt("s", "Pequeña", { balance: 500, rate: 10, minPayment: 25 }), debt("b", "Cara", { balance: 3000, rate: 30, minPayment: 90 })];
  server.plans.set(uid, planRow(uid));
  const h = load({ config: "test", server, storage: signedStorage(uid, { "nando-deudas-v1": JSON.stringify(store) }) });
  await waitFor(() => h.win.MPDDPlan.current(), { label: "plan cargado" });
  await openMethods(h);
  await waitFor(() => /Tu pago mensual del plan:/.test(text(h)), { label: "pago del plan" });
  assert.match(text(h), /Tu pago mensual del plan: US\$315\.00 USD/, "25 + 90 + 200 de extra");
  assert.doesNotMatch(text(h), /Arma tu plan para usar tu pago real/);
  // The user types nothing: no number or text fields, only the slider, the date and the question.
  assert.equal(root(h).querySelectorAll('input[type="number"], input[type="text"], select').length, 0);
  assert.equal(root(h).querySelector(".met-options").tagName, "DETAILS", "la fecha va dentro de Opciones");
  assert.equal(root(h).querySelector(".met-options #met-date").value, new Date().toLocaleDateString("en-CA"));
  // Only the currency selector at the top (1.8: USD, COP and EUR).
  assert.deepEqual([...root(h).querySelectorAll(".met-top button")].map((b) => b.textContent), ["USD", "COP", "EUR"]);
  // Same engine as the plan.
  const debts = [{ id: "s", balance: 500, rate: 10, min: 25 }, { id: "b", balance: 3000, rate: 30, min: 90 }];
  const ava = P.simulate(debts, 200, "avalanche", ym());
  const snow = P.simulate(debts, 200, "snowball", ym());
  assert.match(cardOf(h, "avalanche").textContent, new RegExp("Intereses totales " + M.formatMoney(ava.totalInterest, "USD").replace(/[$.]/g, "\\$&")));
  assert.match(cardOf(h, "snowball").textContent, new RegExp("Intereses totales " + M.formatMoney(snow.totalInterest, "USD").replace(/[$.]/g, "\\$&")));
  assert.match(cardOf(h, "snowball").textContent, new RegExp("Te quitas Pequeña en " + snow.payoffMonths.s + " meses"));
  // "Te quitas [primera deuda]": the first debt that gets paid off with each method.
  const avaFirst = ava.order[0];
  assert.match(cardOf(h, "avalanche").textContent, new RegExp("Te quitas " + (avaFirst === "s" ? "Pequeña" : "Cara") + " en " + ava.payoffMonths[avaFirst] + " meses"));
  const dI = M.formatMoney(snow.totalInterest - ava.totalInterest, "USD");
  assert.ok(text(h).includes("Con avalancha ahorras " + dI), "frase de ahorro");
  assert.ok(text(h).includes("Con bola de nieve te quitas tu primera deuda " + (ava.payoffMonths[avaFirst] - snow.payoffMonths.s) + " meses antes."));
  // Timeline as text, not only color.
  const tl = root(h).querySelector('.met-tl[data-method="snowball"]');
  assert.equal(tl.querySelector(".met-bar").getAttribute("aria-hidden"), "true");
  assert.deepEqual([...tl.querySelectorAll("li")].map((li) => li.textContent.split(" se paga")[0]), ["Pequeña", "Cara"]);
  assert.match(tl.querySelector("li").textContent, new RegExp("se paga en el mes " + snow.payoffMonths.s));
  // Debts change: the tab updates by itself.
  h.win.MPDDApp.updateDebts([{ id: "s", minPayment: 50 }]);
  await sleep(20);
  assert.match(text(h), /Tu pago mensual del plan: US\$340\.00 USD/);
  assert.deepEqual(h.errors, []);
});

test("Métodos: sin plan usa la suma de los mínimos; dos monedas con TRM aproximada; E.A. a tasa mensual", async () => {
  // Effective annual → monthly: (1 + EA)^(1/12) − 1. Nominal (APR) → APR / 12.
  assert.ok(Math.abs(P.monthlyRate(26.82, "EA") - 0.01999) < 0.00002);
  assert.equal(P.monthlyRate(24), 0.02);
  const ea = P.simulate([{ id: "a", balance: 1000, rate: 30, rateType: "EA", min: 100 }], 0, "avalanche", "2026-11");
  const apr = P.simulate([{ id: "a", balance: 1000, rate: 30, min: 100 }], 0, "avalanche", "2026-11");
  assert.ok(ea.totalInterest < apr.totalInterest, "30 % E.A. cobra menos que 30 % nominal");
  const server = new FakeServer();
  const store = [debt("c1", "Tarjeta COP", { currency: "COP", balance: 2000000, rate: 28, minPayment: 100000 }), debt("u1", "Visa", { balance: 600, rate: 20, minPayment: 40 })];
  const h = load({ config: "test", server, storage: Object.assign({}, ES, { "deudas-currency-pref-v1": "COP", "nando-deudas-v1": JSON.stringify(store) }) });
  await sleep(60);
  assert.equal(server.trmCalls, 0, "la TRM se consulta solo al abrir Métodos");
  await openMethods(h);
  await waitFor(() => /TRM de hoy/.test(text(h)), { label: "TRM" });
  assert.equal(server.trmCalls, 1);
  assert.match(text(h), /TRM de hoy: 1 USD = \$4\.000,00 COP · 15 de noviembre de 2026/);
  // 100,000 + 40 × 4000 = 260,000 COP, approximate.
  assert.match(text(h), /Pago mensual \(suma de tus mínimos\): \$260\.000 COP aproximado/);
  assert.ok(root(h).querySelector(".met-card .met-approx"), "intereses marcados como aproximados");
  assert.match(text(h), /Los valores convertidos son aproximados/);
  // No plan: invitation that opens the assistant.
  assert.match(text(h), /Arma tu plan para usar tu pago real/);
  clickText(h, "#metodos-root", "Armar mi plan");
  assert.ok(h.doc.querySelector(".plan-wizard"), "abre el asistente");
  h.doc.querySelector(".pw-close").click();
  // Switch to USD: everything recalculated in dollars.
  root(h).querySelector('[data-met-cur="USD"]').click();
  assert.match(text(h), /Pago mensual \(suma de tus mínimos\): US\$65\.00 USD aproximado/);
  assert.equal(root(h).querySelector('[data-met-cur="USD"]').getAttribute("aria-pressed"), "true");
});

test("Métodos: cuando los dos métodos dan igual, y casos sin deudas o sin fin", async () => {
  // Smallest debt is also the highest-interest one.
  const store = [debt("s", "Pequeña cara", { balance: 400, rate: 35, minPayment: 30 }), debt("b", "Grande barata", { balance: 5000, rate: 12, minPayment: 120 })];
  const h = load({ storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify(store) }) });
  await openMethods(h);
  const sl = h.doc.getElementById("met-extra");
  sl.value = "100";
  sl.dispatchEvent(new h.win.Event("input"));
  assert.match(text(h), /En tu caso los dos métodos dan igual, porque tu deuda más pequeña también es la de mayor interés\./);
  assert.doesNotMatch(text(h), /Con avalancha ahorras/);
  assert.equal(cardOf(h, "snowball").querySelector(".met-interest").textContent, cardOf(h, "avalanche").querySelector(".met-interest").textContent);
  // Payment that never pays off (minimum below the monthly interest).
  const n = load({ storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify([debt("x", "Eterna", { balance: 10000, rate: 36, minPayment: 100 })]) }) });
  await openMethods(n);
  assert.match(text(n), /Con este pago mensual tus deudas no se terminan de pagar/);
  assert.match(cardOf(n, "avalanche").textContent, /Con este pago no terminas de pagar tus deudas/);
  assert.match(cardOf(n, "avalanche").textContent, /Con este pago ninguna deuda se termina de pagar/);
  assert.match(n.doc.querySelector('.met-tl[data-method="avalanche"] li').textContent, /Eterna no se termina de pagar/);
  // No debts: clear message and a button to add one.
  const e = load({ storage: ES });
  await openMethods(e);
  assert.match(text(e), /Aún no tienes deudas para comparar\./);
  clickText(e, "#metodos-root", "Agregar una deuda");
  assert.ok(e.doc.getElementById("dialog").hasAttribute("open"));
  // Debts without rate or minimum are listed, not silently mixed in.
  const m = load({ storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify([debt("a", "Con datos", { minPayment: 20 }), debt("z", "Sin tasa", { rate: null, minPayment: 10 })]) }) });
  await openMethods(m);
  assert.match(text(m), /no se incluyen: Sin tasa/);
  assert.doesNotMatch(m.doc.querySelector(".met-timeline").textContent, /Sin tasa/);
});

test("Métodos: la barra de pago extra actualiza las tarjetas al instante", async () => {
  const store = [debt("s", "Pequeña", { balance: 500, rate: 10, minPayment: 25 }), debt("b", "Cara", { balance: 3000, rate: 30, minPayment: 90 })];
  const h = load({ storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify(store) }) });
  await openMethods(h);
  assert.match(text(h), /Mueve la barra para ver qué pasa/);
  const before = cardOf(h, "avalanche").querySelector(".met-interest").textContent;
  const sl = h.doc.getElementById("met-extra");
  assert.equal(h.doc.querySelector('label[for="met-extra"]').textContent, "Pago extra al mes");
  sl.value = "50";
  sl.dispatchEvent(new h.win.Event("input"));
  assert.notEqual(cardOf(h, "avalanche").querySelector(".met-interest").textContent, before, "tarjetas recalculadas");
  const debts = [{ id: "s", balance: 500, rate: 10, min: 25 }, { id: "b", balance: 3000, rate: 30, min: 90 }];
  const base = P.simulate(debts, 0, "avalanche", ym());
  const more = P.simulate(debts, 50, "avalanche", ym());
  const expected = "Avalancha: Pagando US$165.00 USD al mes terminas " + (base.months - more.months) + " meses antes y ahorras " + M.formatMoney(base.totalInterest - more.totalInterest, "USD") + " más en intereses.";
  assert.equal(h.doc.querySelector(".met-more-text").textContent, expected);
  assert.match(cardOf(h, "avalanche").textContent, new RegExp("Intereses totales " + M.formatMoney(more.totalInterest, "USD").replace(/[$.]/g, "\\$&")));
  assert.equal(sl.getAttribute("aria-valuetext"), "US$50.00 USD");
  // The motivation question picks the method the slider sentence and the button talk about.
  h.doc.querySelector('input[name="met-motive"][value="fast"]').click();
  assert.match(h.doc.querySelector(".met-more-text").textContent, /^Bola de nieve: Pagando/);
  assert.match(text(h), /Te recomendamos bola de nieve/);
  assert.ok(cardOf(h, "snowball").classList.contains("recommended"));
  assert.equal(root(h).querySelector(".met-final button").textContent, "Usar bola de nieve en mi plan");
  h.doc.querySelector('input[name="met-motive"][value="cheap"]').click();
  assert.match(text(h), /Te recomendamos avalancha/);
  assert.equal(root(h).querySelector(".met-final button.save").textContent, "Usar avalancha en mi plan");
  // English: fixed text translated, amounts and names untouched.
  h.doc.getElementById("language-choice").value = "en";
  h.doc.getElementById("language-choice").dispatchEvent(new h.win.Event("change"));
  await sleep(30);
  assert.match(text(h), /What motivates you more\?/);
  assert.match(h.doc.querySelector(".met-more-text").textContent, /^Avalanche: Paying US\$165\.00 USD a month you finish \d+ months sooner and save US\$[\d,.]+ USD more in interest\.$/);
  const map = new Map(I18n.entries);
  assert.deepEqual(Object.values(h.win.MPDDStrings.metodos).filter((s) => !map.has(s)), [], "todas las frases de Métodos tienen traducción");
  assert.deepEqual(Object.values(h.win.MPDDStrings.plan).filter((s) => !map.has(s)), []);
});

test("Métodos: 'Usar en mi plan' cambia el método del plan guardado; sin sesión abre el asistente", async () => {
  const server = new FakeServer();
  const uid = server.addUser("a@ejemplo.test", "x12345678");
  const store = [debt("s", "Pequeña", { balance: 500, rate: 10, minPayment: 25, due: "20" }), debt("b", "Cara", { balance: 3000, rate: 30, minPayment: 90, due: "25" })];
  server.plans.set(uid, planRow(uid));
  const h = load({ config: "test", server, storage: signedStorage(uid, { "nando-deudas-v1": JSON.stringify(store) }) });
  await waitFor(() => h.win.MPDDPlan.current(), { label: "plan cargado" });
  await openMethods(h);
  await waitFor(() => /Tu plan ya usa avalancha\./.test(text(h)));
  let changes = 0;
  h.doc.addEventListener("mpdd:planchange", () => changes++);
  clickText(h, "#metodos-root", "Usar bola de nieve en mi plan");
  await waitFor(() => server.plans.get(uid).method === "snowball", { label: "método guardado" });
  const row = server.plans.get(uid);
  assert.equal(row.extra, 200, "mismos datos del plan");
  assert.equal(row.items.find((i) => i.first).debtId, "s", "pagos recalculados: primero la más pequeña");
  assert.equal(row.items.find((i) => i.debtId === "s").payment, 225);
  await waitFor(() => changes > 0, { label: "mpdd:planchange" });
  await waitFor(() => /Tu plan ya usa bola de nieve\./.test(text(h)));
  assert.match(text(h), /Listo: tu plan ahora usa este método\./);
  assert.match(h.doc.getElementById("plan-root").textContent, /Método bola de nieve/);
  // No session: opens the assistant with the method preselected.
  const n = load({ storage: Object.assign({}, ES, { "deudas-currency-pref-v1": "USD", "nando-deudas-v1": JSON.stringify(store) }) });
  await openMethods(n);
  clickText(n, "#metodos-root", "Usar bola de nieve en mi plan");
  assert.ok(n.doc.querySelector(".plan-wizard"));
  n.doc.getElementById("plan-income").value = "3000";
  for (let i = 0; i < 4; i++) clickText(n, ".plan-wizard", "Siguiente");
  assert.match(n.doc.querySelector(".pw-body").textContent, /Método bola de nieve/);
  const r = await n.win.MPDDPlan.setMethod("otro");
  assert.equal(r.ok, false);
});

/* ---------------- 1.3 pending items ---------------- */
async function buildDraftWithoutAccount(h) {
  await sleep(60);
  clickText(h, "#plan-root", "Empezar");
  h.doc.getElementById("plan-income").value = "1500";
  h.doc.getElementById("plan-income").dispatchEvent(new h.win.Event("input"));
  for (let i = 0; i < 4; i++) clickText(h, ".plan-wizard", "Siguiente");
  clickText(h, ".plan-wizard", "Empezar mi plan");
}

test("1.3: el borrador sobrevive al enlace de inicio de sesión abierto en otra pestaña", async () => {
  const server = new FakeServer();
  const uid = server.addUser("a@ejemplo.test", "x12345678");
  const store = JSON.stringify([debt("a", "A", { balance: 800, rate: 18, minPayment: 40 })]);
  const a = load({ config: "test", server, storage: Object.assign({}, ES, { "deudas-currency-pref-v1": "USD", "nando-deudas-v1": store }) });
  await buildDraftWithoutAccount(a);
  const saved = JSON.parse(a.win.localStorage.getItem(DRAFT));
  assert.ok(saved && typeof saved.savedAt === "number" && Date.now() - saved.savedAt < 5000, "borrador con fecha en localStorage");
  assert.equal(saved.draft.income, "1500");
  assert.ok(a.win.sessionStorage.getItem(DRAFT));
  // The email link opens in another tab: same localStorage, empty sessionStorage, now signed in.
  const b = load({ config: "test", server, storage: signedStorage(uid, { "deudas-currency-pref-v1": "USD", "nando-deudas-v1": store, [DRAFT]: a.win.localStorage.getItem(DRAFT) }) });
  await waitFor(() => /Continuar con tu plan/.test(b.doc.getElementById("plan-root").textContent), { label: "ofrece continuar en la otra pestaña" });
  clickText(b, "#plan-root", "Continuar con tu plan");
  assert.match(b.doc.querySelector(".pw-step").textContent, /Paso 5 de 5/);
  clickText(b, ".plan-wizard", "Empezar mi plan");
  await waitFor(() => server.plans.get(uid), { label: "plan guardado" });
  assert.equal(server.plans.get(uid).income, 1500);
  await waitFor(() => b.win.localStorage.getItem(DRAFT) === null, { label: "se borra al guardar" });
  assert.equal(b.win.sessionStorage.getItem(DRAFT), null);
  // Back in the first tab: its sessionStorage copy is ignored once localStorage no longer has it.
  a.win.localStorage.removeItem(DRAFT);
  a.win.dispatchEvent(new a.win.StorageEvent("storage", { key: DRAFT }));
  assert.equal(a.win.sessionStorage.getItem(DRAFT), null);
});

test("1.3: el borrador vence a las 24 h, 'Descartar' lo borra y se respeta la restauración pendiente", async () => {
  const server = new FakeServer();
  const uid = server.addUser("a@ejemplo.test", "x12345678");
  const store = JSON.stringify([debt("a", "A", { balance: 800, rate: 18, minPayment: 40 })]);
  const draft = { step: 5, income: "1500", incomeCurrency: "USD", planCurrency: null, expenses: [{ key: "vivienda", icon: "🏠", amount: "" }], extra: 0, method: "avalanche", fx: null, edits: {} };
  const old = JSON.stringify({ savedAt: Date.now() - 25 * 3600 * 1000, local: true, draft });
  const h = load({ config: "test", server, storage: signedStorage(uid, { "nando-deudas-v1": store, [DRAFT]: old }) });
  await waitFor(() => h.win.MPDDPlan && /Arma tu plan en 2 minutos/.test(h.doc.getElementById("plan-root").textContent), { label: "pestaña Plan" });
  await sleep(60);
  assert.doesNotMatch(h.doc.getElementById("plan-root").textContent, /Continuar con tu plan/);
  assert.equal(h.win.localStorage.getItem(DRAFT), null, "el borrador vencido se elimina");
  // Fresh draft → "Descartar" removes it everywhere.
  const fresh = JSON.stringify({ savedAt: Date.now() - 3600 * 1000, local: true, draft });
  const d = load({ config: "test", server, storage: signedStorage(uid, { "nando-deudas-v1": store, [DRAFT]: fresh }) });
  await waitFor(() => /Continuar con tu plan/.test(d.doc.getElementById("plan-root").textContent));
  clickText(d, "#plan-root", "Descartar");
  assert.equal(d.win.localStorage.getItem(DRAFT), null);
  assert.equal(d.win.sessionStorage.getItem(DRAFT), null);
  assert.doesNotMatch(d.doc.getElementById("plan-root").textContent, /Continuar con tu plan/);
  // Pending restore: nothing is written to localStorage (only this tab's sessionStorage).
  const j = load({ config: "test", server, storage: Object.assign({}, ES, { "deudas-currency-pref-v1": "USD", "nando-deudas-v1": store, "nando-restore-journal-v1": "{}" }) });
  await sleep(60);
  j.win.MPDDPlan.open();
  j.doc.getElementById("plan-income").value = "1500";
  j.doc.getElementById("plan-income").dispatchEvent(new j.win.Event("input"));
  for (let i = 0; i < 4; i++) clickText(j, ".plan-wizard", "Siguiente");
  clickText(j, ".plan-wizard", "Empezar mi plan");
  assert.equal(j.win.localStorage.getItem(DRAFT), null);
  assert.ok(j.win.sessionStorage.getItem(DRAFT));
});

test("1.3: Escape en el asistente pide confirmación con un diálogo propio", async () => {
  const h = load({ storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify([debt("a", "A", { minPayment: 20 })]) }) });
  await sleep(60);
  let browserDialogs = 0;
  h.win.confirm = h.win.alert = () => {
    browserDialogs++;
    return true;
  };
  clickText(h, "#plan-root", "Empezar");
  const wizard = h.doc.querySelector(".plan-wizard");
  const esc = () => h.doc.activeElement.dispatchEvent(new h.win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  esc();
  const box = wizard.querySelector(".pw-confirm-box");
  assert.ok(box, "aparece la confirmación");
  assert.equal(box.getAttribute("role"), "alertdialog");
  assert.equal(box.getAttribute("aria-modal"), "true");
  assert.equal(h.doc.getElementById(box.getAttribute("aria-labelledby")).textContent, "¿Salir del asistente?");
  assert.match(box.textContent, /¿Salir del asistente\? Perderás lo que llevas/);
  assert.deepEqual([...box.querySelectorAll("button")].map((b) => b.textContent), ["Salir", "Seguir en el asistente"]);
  assert.equal(h.doc.activeElement.textContent, "Seguir en el asistente", "el foco va a la opción segura");
  assert.equal(wizard.querySelector(".pw-top").getAttribute("aria-hidden"), "true");
  // Stay.
  clickText(h, ".pw-confirm", "Seguir en el asistente");
  assert.equal(wizard.querySelector(".pw-confirm"), null);
  assert.ok(h.doc.querySelector(".plan-wizard"));
  assert.equal(wizard.querySelector(".pw-top").getAttribute("aria-hidden"), null);
  // Escape twice: the second one dismisses the confirmation.
  esc();
  esc();
  assert.equal(wizard.querySelector(".pw-confirm"), null);
  assert.ok(h.doc.querySelector(".plan-wizard"));
  // Leave.
  esc();
  clickText(h, ".pw-confirm", "Salir");
  assert.equal(h.doc.querySelector(".plan-wizard"), null);
  assert.ok(!h.doc.body.classList.contains("plan-wizard-open"));
  assert.equal(browserDialogs, 0, "sin diálogos del navegador");
});

test("1.3: con TRM el pago nunca supera lo que se debe ni baja del mínimo; redondeo por moneda", () => {
  const base = (o) => Object.assign({ income: 5000, incomeCurrency: "USD", planCurrency: "USD", expenses: [], extra: 4000, method: "avalanche", fx: 3917.37, debts: [], today: "2026-11-16" }, o);
  // Known case: COP debt of 100,000 at 28 % in a USD plan: 102,333 owed (it showed 102,361).
  const r = P.buildPlan(base({ debts: [{ id: "c", name: "C", currency: "COP", balance: 100000, rate: 28, minPayment: 50000 }, { id: "u", name: "U", currency: "USD", balance: 2000, rate: 20, minPayment: 50 }] }));
  assert.equal(r.items.find((i) => i.debtId === "c").payment, 102333);
  assert.equal(P.owedThisMonth({ currency: "COP", balance: 100000, rate: 28 }), 102333);
  // USD debt of 325 paid off in a COP plan: exactly 325.
  const r2 = P.buildPlan(base({ income: 30000000, incomeCurrency: "COP", planCurrency: "COP", extra: 20000000, fx: 3917.37, debts: [{ id: "u", name: "U", currency: "USD", balance: 325, rate: 0, minPayment: 30 }, { id: "c", name: "C", currency: "COP", balance: 9000000, rate: 20, minPayment: 100000 }] }));
  assert.equal(r2.items.find((i) => i.debtId === "u").payment, 325);
  // Sweep many rates and amounts: the rules always hold.
  let checked = 0;
  for (const fx of [3800.01, 3912.45, 3917.37, 4000, 4123.4567, 4387.99]) {
    for (const [plan, extra] of [["USD", 0], ["USD", 37.5], ["USD", 4000], ["COP", 0], ["COP", 123457], ["COP", 20000000]]) {
      for (const [cb, cm, ub, um, rate] of [[100000, 50000, 324.99, 30, 28], [99999, 120000, 325, 325, 0], [2500000, 80000, 1000.01, 400, 19.9], [7777777, 150000, 50.5, 60, 35]]) {
        const debts = [{ id: "c", name: "C", currency: "COP", balance: cb, rate, minPayment: cm }, { id: "u", name: "U", currency: "USD", balance: ub, rate, minPayment: um }];
        const x = P.buildPlan(base({ income: plan === "USD" ? 50000 : 200000000, incomeCurrency: plan, planCurrency: plan, extra, fx, debts }));
        const sim = P.simulate(debts.map((d) => ({ id: d.id, balance: P.convert(d.balance, d.currency, plan, fx), rate, min: P.convert(Math.min(d.minPayment, d.balance * (1 + rate / 1200)), d.currency, plan, fx) })), x.extra, "avalanche", "2026-11");
        for (const d of debts) {
          const it = x.items.find((i) => i.debtId === d.id);
          const owed = P.owedThisMonth(d);
          const label = `${d.id} fx=${fx} plan=${plan} extra=${extra} pago=${it.payment} debe=${owed}`;
          assert.ok(it.payment <= owed, "nunca más de lo que se debe: " + label);
          assert.ok(it.payment >= Math.min(d.minPayment, owed), "nunca menos del mínimo: " + label);
          assert.equal(it.payment, P.round(it.payment, d.currency), "redondeo por moneda: " + label);
          if (sim.payoffMonths[d.id] === 1) assert.equal(it.payment, owed, "si se paga este mes, exactamente lo que se debe: " + label);
          checked++;
        }
      }
    }
  }
  assert.equal(checked, 288);
});

test("revisión 1.4: Escape funciona aunque el foco esté en <body>", async () => {
  const h = load({ storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify([debt("a", "A", { minPayment: 20 })]) }) });
  await sleep(60);
  clickText(h, "#plan-root", "Empezar");
  const wizard = h.doc.querySelector(".plan-wizard");
  h.doc.activeElement.blur();
  h.doc.body.dispatchEvent(new h.win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  assert.ok(wizard.querySelector(".pw-confirm-box"), "aparece la confirmación");
});
