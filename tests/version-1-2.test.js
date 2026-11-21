/* Pruebas de la versión 1.2: moneda por deuda, totales por moneda, calendario,
   estado de pagos, dona, recordatorios, CSV y actualización automática. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const Money = require("../dist/money.js");
const S = require("../dist/schedule-core.js");
const Core = require("../dist/cloud-core.js");
const I18n = require("../dist/i18n.js");
const { load, closeAll, sleep, debt, addDebtViaForm, waitFor } = require("./harness");
test.afterEach(closeAll);

const ES = { "deudas-lang-v1": "es" };
const today = () => new Date().toLocaleDateString("en-CA");
const ym = () => today().slice(0, 7);
const dayOf = (d) => ym() + "-" + String(d).padStart(2, "0");
const lines = (doc) => [...doc.querySelectorAll("#total .amount-line")].map((x) => x.textContent);

test("formatMoney: formato exacto de USD y COP", () => {
  assert.equal(Money.formatMoney(1250, "USD"), "US$1,250.00 USD");
  assert.equal(Money.formatMoney(12450, "USD"), "US$12,450.00 USD");
  assert.equal(Money.formatMoney(0.5, "USD"), "US$0.50 USD");
  assert.equal(Money.formatMoney(1250000, "COP"), "$1.250.000 COP");
  assert.equal(Money.formatMoney(8300000.4, "COP"), "$8.300.000 COP");
  assert.equal(Money.formatMoney(1250, "COP"), "$1.250 COP");
  assert.equal(Money.formatMoney(-20, "USD"), "−US$20.00 USD");
  assert.deepEqual(Money.totalsByCurrency([{ currency: "USD", v: 1 }, { currency: "COP", v: 1000 }, { currency: "USD", v: 2.5 }], (x) => x.v), { USD: 3.5, COP: 1000 });
  // Only one function formats money in the whole app.
  const dist = path.join(__dirname, "..", "dist");
  const users = fs.readdirSync(dist).filter((f) => /\.(js|html)$/.test(f)).filter((f) => /Intl\.NumberFormat\([^)]*(currency|USD|COP|maximumFractionDigits)/.test(fs.readFileSync(path.join(dist, f), "utf8")));
  assert.deepEqual(users, ["money.js"]);
});

test("inicio: total separado por moneda, una línea por moneda y sin mezclar", async () => {
  const h = load({ storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify([debt("u1", "Tarjeta", { balance: 12450, initial: 15000 }), debt("c1", "Préstamo", { currency: "COP", balance: 8300000, initial: 9000000 })]) }) });
  await sleep(80);
  assert.match(h.doc.querySelector("#view-home .overview .label").textContent, /Total que debes/);
  assert.deepEqual(lines(h.doc), ["US$12,450.00 USD", "$8.300.000 COP"]);
  for (const l of lines(h.doc)) assert.ok(!(l.includes("USD") && l.includes("COP")), "una línea mezcla monedas: " + l);
  // Both debts listed, grouped by currency.
  assert.deepEqual([...h.doc.querySelectorAll("#cards .cur-heading")].map((x) => x.textContent), ["Deudas en USD", "Deudas en COP"]);
  assert.equal(h.doc.querySelectorAll("#cards article").length, 2);
  assert.deepEqual(h.errors, []);
});

test("inicio: con una sola moneda se muestra solo esa línea", async () => {
  const h = load({ storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify([debt("c1", "Préstamo", { currency: "COP", balance: 1250000, initial: 2000000 })]) }) });
  await sleep(60);
  assert.deepEqual(lines(h.doc), ["$1.250.000 COP"]);
  assert.equal(h.doc.querySelectorAll("#cards .cur-heading").length, 0);
});

test("la moneda de Ajustes solo define la de las deudas nuevas", async () => {
  const h = load({ storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify([debt("u1", "En dólares")]) }) });
  await sleep(60);
  h.doc.querySelector('[data-cur="COP"]').click();
  assert.equal(h.win.localStorage.getItem("deudas-currency-pref-v1"), "COP");
  h.doc.getElementById("add").click();
  assert.equal(h.doc.getElementById("currency").value, "COP", "la deuda nueva propone COP");
  h.doc.getElementById("name").value = "En pesos";
  h.doc.getElementById("balance").value = "500000";
  h.doc.getElementById("form").dispatchEvent(new h.win.Event("submit", { cancelable: true }));
  await sleep(30);
  const saved = h.debts();
  assert.equal(saved.find((d) => d.name === "En dólares").currency, "USD", "las existentes no cambian");
  assert.equal(saved.find((d) => d.name === "En pesos").currency, "COP");
  assert.ok(S.validDate(saved.find((d) => d.name === "En pesos").createdAt));
  assert.equal(lines(h.doc).length, 2, "ambas monedas visibles a la vez");
});

test("formulario: cuota mensual y categoría opcionales; pago con fecha de vencimiento y estado", async () => {
  const h = load({ storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify([debt("u1", "Tarjeta", { due: "10" })]) }) });
  await sleep(60);
  const { doc, win } = h;
  doc.querySelector("[data-edit]").click();
  doc.getElementById("minPayment").value = "25";
  doc.getElementById("category").value = "tarjeta";
  doc.getElementById("form").dispatchEvent(new win.Event("submit", { cancelable: true }));
  await sleep(20);
  assert.equal(h.debts()[0].minPayment, 25);
  assert.equal(h.debts()[0].category, "tarjeta");
  assert.match(doc.querySelector("#cards").textContent, /Tarjeta de crédito/);
  // Late payment: paid after its due date.
  doc.querySelector("[data-pay]").click();
  assert.equal(doc.getElementById("payment").value, "25", "propone la cuota");
  assert.equal(doc.getElementById("dueDate").value, dayOf(10), "propone el vencimiento del mes");
  doc.getElementById("date").value = dayOf(12);
  doc.getElementById("form").dispatchEvent(new win.Event("submit", { cancelable: true }));
  await sleep(20);
  const hist = h.debts()[0].history;
  assert.deepEqual(hist[0], { amount: 25, date: dayOf(12), dueDate: dayOf(10) });
  assert.equal(S.paymentStatus(hist[0]), "late");
  assert.match(doc.querySelector("#cards .month-status").textContent, /Pagado tarde/);
  // The due date is optional: a payment without it is stored without the field.
  doc.querySelector("[data-pay]").click();
  doc.getElementById("payment").value = "5";
  doc.getElementById("dueDate").value = "";
  doc.getElementById("form").dispatchEvent(new win.Event("submit", { cancelable: true }));
  await sleep(20);
  assert.deepEqual(Object.keys(h.debts()[0].history[1]).sort(), ["amount", "date"]);
});

test("estado de cada pago y cuotas: a tiempo, tarde, pendiente y vencido", () => {
  const d = debt("a", "A", { due: "15", createdAt: "2026-01-01", history: [{ amount: 10, date: "2026-01-14", dueDate: "2026-01-15" }, { amount: 10, date: "2026-02-20", dueDate: "2026-02-15" }] });
  const list = S.installments([d], { from: "2026-01-01", to: "2026-04-30", today: "2026-03-20" });
  assert.deepEqual(list.map((i) => [i.dueDate, i.status]), [["2026-01-15", "onTime"], ["2026-02-15", "late"], ["2026-03-15", "overdue"], ["2026-04-15", "pending"]]);
  // Short months: day 31 falls on the last day.
  assert.equal(S.installments([debt("b", "B", { due: "31", createdAt: "2026-02-01" })], { from: "2026-02-01", to: "2026-02-28", today: "2026-02-01" })[0].dueDate, "2026-02-28");
  // A paid-off debt does not generate new pending installments.
  assert.equal(S.installments([debt("c", "C", { due: "5", balance: 0, createdAt: "2026-01-01" })], { from: "2026-01-01", to: "2026-03-31", today: "2026-02-10" }).length, 0);
  // Legacy payments (no due date) count for the installment of their month.
  assert.equal(S.installments([debt("e", "E", { due: "5", createdAt: "2026-01-01", history: [{ amount: 1, date: "2026-01-03" }] })], { from: "2026-01-01", to: "2026-01-31", today: "2026-02-10" })[0].status, "onTime");
  assert.equal(S.paymentStatus({ amount: 1, date: "2026-01-03" }), "paid");
});

test("calendario: colores, resumen por moneda y marcar como pagado", async () => {
  const t = today();
  const dnum = +t.slice(8, 10);
  // Pick days different from today within the month.
  const other = (n) => (n === dnum ? (n === 1 ? 2 : n - 1) : n);
  const earlier = dnum > 2 ? dnum - 1 : null;
  const store = [
    debt("u1", "Tarjeta", { due: String(other(1)), minPayment: 50, createdAt: ym() + "-01", history: [] }),
    debt("c1", "Moto", { currency: "COP", due: String(dnum), minPayment: 300000, createdAt: ym() + "-01", history: [{ amount: 300000, date: t, dueDate: t }] }),
  ];
  const h = load({ storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify(store) }) });
  await sleep(80);
  const { doc, win } = h;
  const cell = (d) => doc.querySelector(`.cal-day[data-date="${dayOf(d)}"]`);
  assert.ok(cell(dnum).classList.contains("c-today"), "hoy en naranja");
  const due1 = dayOf(other(1));
  const c1 = doc.querySelector(`.cal-day[data-date="${due1}"]`);
  if (due1 < t) assert.ok(c1.classList.contains("c-late"), "vencido sin pagar en rojo");
  else assert.ok(c1.classList.contains("c-pending"));
  const blank = [...doc.querySelectorAll(".cal-day.c-none")];
  assert.ok(blank.length > 20, "días sin pagos en blanco");
  // Summary separated by currency.
  const sum = doc.querySelector(".cal-summary").textContent;
  assert.match(sum, /Por pagar este mes.*US\$50\.00 USD/);
  assert.match(sum, /Pagado este mes.*\$300\.000 COP/);
  assert.doesNotMatch(sum, /US\$300/);
  // Tap the USD due day and mark it as paid.
  c1.click();
  const detail = doc.querySelector(".cal-detail");
  assert.match(detail.textContent, /Tarjeta/);
  assert.match(detail.textContent, /US\$50\.00 USD/);
  [...detail.querySelectorAll("button")].find((b) => b.textContent === "Marcar como pagado").click();
  assert.ok(doc.getElementById("dialog").hasAttribute("open"));
  assert.equal(doc.getElementById("payment").value, "50");
  assert.equal(doc.getElementById("dueDate").value, due1);
  doc.getElementById("form").dispatchEvent(new win.Event("submit", { cancelable: true }));
  await sleep(30);
  const u = h.debts().find((d) => d.id === "u1");
  assert.equal(u.history.length, 1);
  assert.equal(u.history[0].dueDate, due1);
  assert.equal(u.balance, 50);
  const after = doc.querySelector(`.cal-day[data-date="${due1}"]`);
  assert.ok(after.classList.contains("c-paid") || after.classList.contains("c-late"), "el día se actualiza");
  if (earlier) assert.ok(doc.querySelector(".cal-nav h3").textContent.length > 3);
  // Month navigation.
  doc.querySelector(".cal-nav button").click();
  assert.equal(doc.querySelector(`.cal-day[data-date="${dayOf(dnum)}"]`), null, "cambió de mes");
});

test("gráfico de dona: una moneda a la vez, total en el centro y lista con estados", async () => {
  const store = [
    debt("u1", "Tarjeta", { category: "tarjeta", history: [{ amount: 30, date: dayOf(2), dueDate: dayOf(5) }, { amount: 20, date: dayOf(9), dueDate: dayOf(5) }] }),
    debt("u2", "Carro", { category: "vehiculo", history: [{ amount: 50, date: dayOf(3) }] }),
    debt("c1", "Préstamo", { currency: "COP", category: "prestamo", history: [{ amount: 400000, date: dayOf(4) }] }),
  ];
  const h = load({ storage: Object.assign({}, ES, { "deudas-currency-pref-v1": "USD", "nando-deudas-v1": JSON.stringify(store) }) });
  await sleep(80);
  const { doc, win } = h;
  const center = () => doc.querySelector(".donut-total").textContent;
  assert.equal(center(), "US$100.00 USD");
  assert.match(doc.querySelector(".donut-legend").textContent, /Tarjeta.*US\$50\.00 USD.*50%/);
  assert.doesNotMatch(doc.querySelector(".donut-legend").textContent, /COP/, "la dona USD no incluye COP");
  doc.querySelector('[data-chart-cur="COP"]').click();
  assert.equal(center(), "$400.000 COP");
  assert.doesNotMatch(doc.querySelector(".donut-legend").textContent, /USD/);
  // Group by category.
  doc.querySelector('[data-chart-cur="USD"]').click();
  const group = doc.querySelector(".chart-controls select");
  group.value = "category";
  group.dispatchEvent(new win.Event("change"));
  assert.match(doc.querySelector(".donut-legend").textContent, /Tarjeta de crédito/);
  assert.match(doc.querySelector(".donut-legend").textContent, /Vehículo/);
  // List below shows each payment with status, amount and currency.
  const list = doc.querySelector(".chart-view .pay-list").textContent;
  assert.match(list, /Pagado tarde.*US\$20\.00 USD/);
  assert.match(list, /Pagado a tiempo.*US\$30\.00 USD/);
  assert.match(list, /\$400\.000 COP/);
  // Date range.
  const [from, to] = doc.querySelectorAll(".chart-controls input[type=date]");
  from.value = dayOf(3);
  to.value = dayOf(3);
  to.dispatchEvent(new win.Event("change"));
  assert.equal(center(), "US$50.00 USD");
  from.value = dayOf(5);
  to.value = dayOf(1);
  to.dispatchEvent(new win.Event("change"));
  assert.match(doc.querySelector(".chart-view [role=status]").textContent, /Desde/);
});

test("recordatorios en Ajustes y contador rojo en la pestaña de deudas", async () => {
  const t = today();
  const plus = (n) => S.addDays(t, n);
  const store = [
    debt("a", "Vencida", { due: String(+plus(-3).slice(8, 10)), createdAt: plus(-40) }),
    debt("b", "Próxima", { due: String(+plus(2).slice(8, 10)), createdAt: plus(-1) }),
    debt("c", "Lejana", { due: String(+plus(6).slice(8, 10)), createdAt: plus(-1) }),
  ];
  const h = load({ storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify(store) }) });
  await sleep(80);
  const { doc, win } = h;
  const badge = () => {
    const b = doc.querySelector('.bottom-nav [data-target="home"] .nav-badge');
    return b ? b.textContent : "0";
  };
  const expected = (days) => String(S.badgeCount(store, t, days));
  assert.equal(badge(), expected(3));
  assert.ok(Number(badge()) >= 2, "vencida + próxima");
  const days = doc.getElementById("avisos-days");
  assert.deepEqual([...days.options].map((o) => o.value), ["1", "3", "7"]);
  days.value = "7";
  days.dispatchEvent(new win.Event("change"));
  assert.deepEqual(JSON.parse(win.localStorage.getItem("mpdd-avisos-v1")), { daysBefore: 7 }, "sin hora elegida no se limita por hora");
  assert.equal(S.readAvisos(win.localStorage).timeSet, false);
  assert.equal(badge(), expected(7));
  const time = doc.getElementById("avisos-time");
  time.value = "19:45";
  time.dispatchEvent(new win.Event("change"));
  assert.equal(JSON.parse(win.localStorage.getItem("mpdd-avisos-v1")).time, "19:45");
  assert.equal(doc.getElementById("avisos-enabled").checked, false);
  // Turning on without browser support explains it and stays off.
  const box = doc.getElementById("avisos-enabled");
  box.checked = true;
  box.dispatchEvent(new win.Event("change"));
  await sleep(20);
  assert.equal(box.checked, false);
  assert.ok(doc.querySelector(".settings-block [role=status]").textContent.length > 5);
});

test("exportar CSV: monto limpio, columna Moneda y sin fórmulas", async () => {
  const store = [
    debt("u1", "=HYPERLINK(\"x\")", { history: [{ amount: 1250.5, date: dayOf(2), dueDate: dayOf(1) }] }),
    debt("c1", "Préstamo, banco", { currency: "COP", history: [{ amount: 1250000, date: dayOf(3) }] }),
  ];
  const h = load({ storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify(store) }) });
  await sleep(60);
  h.doc.getElementById("csv-export").click();
  const csv = h.win.MPDDLastCSV;
  const rows = csv.replace(/^﻿/, "").trim().split("\r\n");
  assert.equal(rows[0], "Fecha de pago,Fecha de vencimiento,Deuda,Categoría,Monto,Moneda,Estado");
  assert.equal(rows[1], `${dayOf(2)},${dayOf(1)},"'=HYPERLINK(""x"")",Sin categoría,1250.50,USD,Pagado tarde`);
  assert.equal(rows[2], `${dayOf(3)},,"Préstamo, banco",Sin categoría,1250000,COP,Pagado`);
  assert.match(h.doc.querySelector(".csv-out a").download, /^pagos-\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/);
});

test("datos de la 1.1 se cargan sin cambios y los campos nuevos viajan en respaldo y nube", async () => {
  const legacy = [debt("x", "Antigua", { history: [{ amount: 5, date: "2026-10-01" }] })];
  const h = load({ storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify(legacy) }) });
  await sleep(60);
  assert.deepEqual(h.debts(), legacy);
  assert.deepEqual(h.errors, []);
  // New fields are preserved by the cloud mapping (extra columns) without loops.
  const d = debt("n", "Nueva", { minPayment: 10, category: "tarjeta", createdAt: "2026-11-01", history: [{ amount: 3, date: "2026-11-02", dueDate: "2026-11-05" }] });
  const remote = Core.toRemote(d);
  assert.deepEqual(remote.extra, { minPayment: 10, category: "tarjeta", createdAt: "2026-11-01" });
  assert.deepEqual(remote.payments[0].extra, { dueDate: "2026-11-05" });
  const back = Core.fromRemote("n", remote);
  assert.equal(Core.hash(Core.toRemote(back)), Core.hash(remote));
  assert.equal(back.history[0].dueDate, "2026-11-05");
  // Backup validation accepts the new fields.
  const r = h.win.DebtBackup.validateBackup(JSON.stringify({ version: 1, debts: [d] }));
  assert.ok(r && r.ok !== false && !r.error, "el respaldo con campos nuevos es válido: " + JSON.stringify(r).slice(0, 120));
});

test("textos nuevos traducidos al inglés", async () => {
  const h = load({ storage: ES });
  await sleep(60);
  const map = new Map(I18n.entries);
  const missing = [];
  for (const mod of Object.values(h.win.MPDDStrings)) for (const es of Object.values(mod)) if (!map.has(es)) missing.push(es);
  for (const es of ["Total que debes", "Cuota de este mes", "Pagado a tiempo", "Pagado tarde", "Pendiente", "Deudas en USD", "Deudas en COP", "Cuota mensual (opcional)", "Categoría (opcional)", "Fecha de vencimiento (opcional)", "Sin categoría", ...S.CATEGORIES.map((c) => c[1])]) if (!map.has(es)) missing.push(es);
  assert.deepEqual(missing, []);
  const e = load({ storage: { "deudas-lang-v1": "en", "nando-deudas-v1": JSON.stringify([debt("u1", "Card", { due: "5" })]) } });
  await sleep(80);
  assert.match(e.doc.getElementById("view-home").textContent, /Total you owe/);
  assert.match(e.doc.getElementById("view-calendar").textContent, /Payment calendar/);
  assert.match(e.doc.getElementById("view-chart").textContent, /Payments by period/);
  assert.match(e.doc.getElementById("view-more").textContent, /Export payments \(CSV\)/);
  assert.deepEqual([...e.doc.querySelectorAll(".bottom-nav button")].map((b) => b.textContent.replace(/\d+/g, "")), ["Home", "Plan", "Methods", "Calendar", "Chart", "More"]); // 1.4: the "Alerts" tab was removed
});

test("actualización: aviso 'Nueva versión disponible – Actualizar' y salto del service worker", async () => {
  const sent = [];
  const listeners = {};
  const waiting = { postMessage: (m) => sent.push(m), addEventListener() {} };
  const reg = { waiting, update: () => Promise.resolve(), addEventListener() {} };
  const h = load({ storage: ES });
  // Inject a fake service worker container and re-run the update module.
  Object.defineProperty(h.win.navigator, "serviceWorker", { configurable: true, value: { controller: {}, ready: Promise.resolve(reg), addEventListener: (t, fn) => (listeners[t] = fn) } });
  const src = fs.readFileSync(path.join(__dirname, "..", "dist", "actualizacion.js"), "utf8");
  h.win.eval(src);
  await waitFor(() => h.doc.querySelector(".update-banner"), { label: "aviso" });
  const bar = h.doc.querySelector(".update-banner");
  assert.equal(bar.textContent, "Nueva versión disponible – Actualizar");
  bar.querySelector("button").click();
  assert.equal(JSON.stringify(sent), JSON.stringify([{ type: "SKIP_WAITING" }]));
  assert.equal(typeof listeners.controllerchange, "function");
});

test("service worker y Netlify: caché por versión, borra cachés viejos, sin caché de index.html ni sw.js", () => {
  const sw = fs.readFileSync(path.join(__dirname, "..", "dist", "sw.js"), "utf8");
  assert.match(sw, /const CACHE='mpd-cache-v\d+\.\d+'/);
  assert.match(sw, /SKIP_WAITING/);
  assert.match(sw, /startsWith\('deudas-pwa-'\)\|\|k\.startsWith\('mpd-cache-'\)/);
  assert.match(sw, /cache:'reload'/);
  assert.match(sw, /if\(keys\.some\(k=>k\.startsWith\('deudas-pwa-'\)\)\)self\.skipWaiting\(\)/, "solo salta solo al migrar desde versiones sin aviso");
  assert.match(sw, /c\.match\('\/offline-home'\)\)\.then\(cached=>cached\|\|fetch/, "la página coincide con los archivos de su versión");
  const toml = fs.readFileSync(path.join(__dirname, "..", "netlify.toml"), "utf8");
  assert.match(toml, /publish = "dist"/);
  for (const p of ["/", "/index.html", "/sw.js"]) assert.match(toml, new RegExp('for = "' + p.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&") + '"\\s*\\n\\s*\\[headers\\.values\\]\\s*\\n\\s*Cache-Control = "no-cache, no-store, must-revalidate"'));
  const version = fs.readFileSync(path.join(__dirname, "..", "dist", "app-version.js"), "utf8");
  assert.match(version, /VERSION='\d+\.\d+'/);
  // Each release must change the cache name together with the visible version.
  const v = version.match(/VERSION='([^']+)'/)[1];
  assert.equal(sw.match(/const CACHE='([^']+)'/)[1], "mpd-cache-v" + v, "CACHE debe ser mpd-cache-v<versión>");
  assert.doesNotMatch(sw, /catch\(_\)\{\}\s*\n\/\/ Versions before/, "guardar la página de inicio es obligatorio al instalar");
});

test("revisión: nombre con HTML no se ejecuta en el formulario de pago", async () => {
  const evil = '<img src=x onerror="window.__pwned=1">';
  const h = load({ storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify([debt("u1", evil, { due: "5" })]) }) });
  await sleep(60);
  h.doc.querySelector("[data-pay]").click();
  assert.equal(h.doc.querySelectorAll("#fields img, #dialog img").length, 0);
  assert.ok(h.doc.querySelector("#fields label").textContent.includes(evil));
  h.win.MPDDApp.openPayment("u1", { dueDate: dayOf(5) });
  assert.equal(h.doc.querySelectorAll("img:not(.brand img):not(.auth-brand img)").length, 0);
  assert.equal(h.win.__pwned, undefined);
});

test("revisión: un pago rechazado no descuenta el saldo", async () => {
  const h = load({ storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify([debt("u1", "Tarjeta", { balance: 500, initial: 500 })]) }) });
  await sleep(60);
  const { doc, win } = h;
  doc.querySelector("[data-pay]").click();
  doc.getElementById("payment").value = "100";
  doc.getElementById("date").value = "0026-11-15"; // año mal escrito
  doc.getElementById("form").dispatchEvent(new win.Event("submit", { cancelable: true }));
  assert.match(doc.getElementById("error").textContent, /fecha del pago/);
  doc.getElementById("date").value = today();
  doc.getElementById("form").dispatchEvent(new win.Event("submit", { cancelable: true }));
  await sleep(20);
  assert.equal(h.debts()[0].balance, 400, "descuenta una sola vez");
  assert.equal(h.debts()[0].history.length, 1);
});

test("revisión: cambiar el día de vencimiento no vuelve rojos los meses pagados; datos 1.1 sin meses vencidos", () => {
  const d = debt("a", "A", { due: "20", createdAt: "2026-08-01", history: ["08", "09", "10"].map((m) => ({ amount: 5, date: `2026-${m}-09`, dueDate: `2026-${m}-10` })) });
  const st = S.installments([d], { from: "2026-08-01", to: "2026-10-31", today: "2026-11-15" }).map((i) => i.status);
  assert.deepEqual(st, ["onTime", "onTime", "onTime"]);
  const legacy = debt("b", "B", { due: "5", history: [{ amount: 1, date: "2025-01-10" }] });
  assert.equal(S.badgeCount([legacy], "2026-11-15", 3), 1, "solo la cuota de este mes, no 22 meses");
});

test("revisión: no se cambia la moneda de una deuda con pagos; CSV protege espacios antes de =", async () => {
  const h = load({ storage: Object.assign({}, ES, { "nando-deudas-v1": JSON.stringify([debt("u1", "Con pagos", { history: [{ amount: 5, date: dayOf(1) }] })]) }) });
  await sleep(60);
  h.doc.querySelector("[data-edit]").click();
  h.doc.getElementById("currency").value = "COP";
  h.doc.getElementById("form").dispatchEvent(new h.win.Event("submit", { cancelable: true }));
  assert.match(h.doc.getElementById("error").textContent, /crea una deuda nueva/);
  assert.equal(h.debts()[0].currency, "USD");
  assert.equal(S.csvCell(" =1+1"), "' =1+1");
  assert.equal(S.csvCell("-5"), "'-5");
});

test("revisión: el pago propone la cuota más antigua sin pagar", () => {
  // Pure check of the rule used by the form.
  const d = debt("a", "A", { due: "5", createdAt: "2026-10-01" });
  const open = S.installments([d], { from: "2026-09-01", to: "2026-12-31", today: "2026-11-02" }).filter((i) => !i.payment);
  assert.equal(open[0].dueDate, "2026-10-05");
});
