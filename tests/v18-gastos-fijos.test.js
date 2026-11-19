/* Tests for version 1.8: "Gastos fijos" in Inicio, calendar, reminders, .ics, backups and sync.
   The device clock starts on Wednesday 2026-11-18 at noon (local time) and keeps moving.
   Run: cd tests && npm test */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { load, closeAll, sleep, waitFor, session, debt } = require("./harness");
const { FakeServer } = require("./fake-supabase");
const Push = require("../dist/notificaciones.js");
test.afterEach(closeAll);

const ES = { "deudas-lang-v1": "es" };
const KEY = "mpdd-gastos-fijos-v1";
const CATS = "mpdd-gastos-categorias-v1";
/* Values from the page come from another realm: compare them as plain JSON. */
const eq = (actual, expected, msg) => assert.deepEqual(JSON.parse(JSON.stringify(actual)), JSON.parse(JSON.stringify(expected)), msg);

/* Moving clock that starts on 2026-11-18 12:00 local time. */
function clock(win) {
  const Real = win.Date;
  const start = new Real(2026, 10, 18, 12, 0, 0).getTime();
  const realStart = Real.now();
  const now = () => start + (Real.now() - realStart);
  class FakeDate extends Real {
    constructor(...a) {
      if (a.length === 0) super(now());
      else super(...a);
    }
    static now() {
      return now();
    }
  }
  win.Date = FakeDate;
}
function open(extra = {}, opts = {}) {
  return load(Object.assign({ storage: Object.assign({}, ES, extra), beforeParse: clock }, opts));
}
function gasto(id, name, extra = {}) {
  return Object.assign({ id, name, amount: 100, currency: "USD", frequency: "monthly", day: 25, month: null, category: "", note: "", payments: [], createdAt: "2026-11-01", updatedAt: "2026-11-01T10:00:00.000Z" }, extra);
}
const stored = (h) => JSON.parse(h.win.localStorage.getItem(KEY) || "[]");
const cardOf = (h, id) => h.doc.querySelector('#gastos-fijos .gf-card[data-gasto-id="' + id + '"]');
const text = (n) => (n ? n.textContent.replace(/\s+/g, " ").trim() : "");
function submit(h) {
  h.doc.querySelector("#gf-dialog form").dispatchEvent(new h.win.Event("submit", { cancelable: true }));
}
function setValue(h, id, value) {
  const n = h.doc.getElementById(id);
  n.value = value;
  n.dispatchEvent(new h.win.Event("change"));
}

/* ---------------- 1. Section, form, add / edit / delete ---------------- */

test("Inicio: sección Gastos fijos debajo de las deudas, estado vacío con botón", async () => {
  const h = open();
  await sleep(60);
  eq(h.errors, []);
  const sec = h.doc.getElementById("gastos-fijos");
  assert.ok(sec, "existe la sección");
  assert.ok(sec.closest("#view-home"), "está en Inicio");
  assert.equal(h.doc.getElementById("cards").nextElementSibling, sec, "justo debajo de las deudas");
  assert.equal(sec.querySelector("h2").textContent, "Gastos fijos");
  assert.match(text(sec), /Aún no tienes gastos fijos registrados\./);
  assert.ok(sec.querySelector(".gf-empty button.gf-add"), "botón en el estado vacío");
});

test("agregar, editar y eliminar un gasto fijo con el formulario (monto con coma o punto)", async () => {
  const h = open({ "deudas-currency-pref-v1": "COP" });
  await sleep(60);
  const { doc } = h;
  doc.getElementById("gf-add").click();
  const dialog = doc.getElementById("gf-dialog");
  assert.ok(dialog.hasAttribute("open"), "abre el diálogo");
  assert.equal(doc.getElementById("gf-currency").value, "COP", "moneda preferida por defecto");
  assert.equal(doc.getElementById("gf-month").closest(".field").hidden, true, "mensual: sin mes");
  // Validation
  submit(h);
  assert.equal(doc.querySelector(".gf-error").textContent, "Escribe un nombre para el gasto.");
  setValue(h, "gf-name", "Agua");
  setValue(h, "gf-amount", "abc");
  submit(h);
  assert.match(doc.querySelector(".gf-error").textContent, /monto mayor que cero/);
  setValue(h, "gf-amount", "85.500");
  setValue(h, "gf-day", "40");
  submit(h);
  assert.equal(doc.querySelector(".gf-error").textContent, "Elige un día de pago entre 1 y 31.");
  setValue(h, "gf-day", "5");
  setValue(h, "gf-category", "agua");
  submit(h);
  assert.ok(!dialog.hasAttribute("open"), "se cierra al guardar");
  let list = stored(h);
  assert.equal(list.length, 1);
  eq([list[0].name, list[0].amount, list[0].currency, list[0].frequency, list[0].day, list[0].month, list[0].category], ["Agua", 85500, "COP", "monthly", 5, null, "agua"]);
  const card = cardOf(h, list[0].id);
  assert.match(text(card), /💧/);
  assert.match(text(card), /\$85\.500 COP/);
  assert.match(text(card), /Mensual/);
  assert.equal(card.querySelector("h3").dataset.localizedOutput, "true", "el nombre no se traduce");

  // Edit: annual in March, decimals with comma, currency USD.
  card.querySelector(".gf-edit").click();
  assert.equal(doc.getElementById("gf-name").value, "Agua");
  setValue(h, "gf-name", "Predial");
  setValue(h, "gf-amount", "1.234,56");
  setValue(h, "gf-currency", "USD");
  setValue(h, "gf-frequency", "annual");
  assert.equal(doc.getElementById("gf-month").closest(".field").hidden, false, "no mensual: pide el mes");
  setValue(h, "gf-month", "3");
  setValue(h, "gf-category", "impuestos");
  setValue(h, "gf-note", "Pago anual del municipio");
  submit(h);
  list = stored(h);
  assert.equal(list.length, 1, "edita, no duplica");
  eq([list[0].name, list[0].amount, list[0].currency, list[0].frequency, list[0].month, list[0].note], ["Predial", 1234.56, "USD", "annual", 3, "Pago anual del municipio"]);

  // Delete with confirmation.
  cardOf(h, list[0].id).querySelector(".gf-delete").click();
  const confirm = doc.querySelector("#gastos-fijos .gf-confirm");
  assert.ok(confirm, "pide confirmación");
  assert.match(text(confirm), /¿Eliminar este gasto fijo y sus pagos registrados\? Predial/);
  confirm.querySelector(".gf-cancel-delete").click();
  assert.equal(h.win.MPDDGastos.list().length, 1, "cancelar no borra");
  cardOf(h, list[0].id).querySelector(".gf-delete").click();
  doc.querySelector("#gastos-fijos .gf-confirm-delete").click();
  assert.equal(h.win.MPDDGastos.list().length, 0);
  assert.equal(stored(h)[0].deleted, true, "queda la marca de borrado para sincronizar");
  assert.match(text(doc.getElementById("gastos-fijos")), /Aún no tienes gastos fijos/);
  eq(h.errors, []);
});

test("parseAmount: punto o coma, miles y decimales", async () => {
  const h = open();
  await sleep(30);
  const p = h.win.MPDDGastosUI.parseAmount;
  assert.equal(p("12,5"), 12.5);
  assert.equal(p("12.50"), 12.5);
  assert.equal(p("1.200"), 1200);
  assert.equal(p("1,200"), 1200);
  assert.equal(p("1.234,56"), 1234.56);
  assert.equal(p("1,234.56"), 1234.56);
  assert.equal(p("2.500.000"), 2500000);
  assert.equal(p(" US$ 45 "), 45);
  for (const bad of ["", "abc", "1,2,3", "12.", "-5", "1.234.5"]) assert.ok(Number.isNaN(p(bad)), bad);
});

test("categoría propia: «+ Nueva categoría» pide nombre e ícono", async () => {
  const h = open();
  await sleep(60);
  const { doc } = h;
  doc.getElementById("gf-add").click();
  setValue(h, "gf-name", "Fibra óptica");
  setValue(h, "gf-amount", "60");
  setValue(h, "gf-day", "12");
  setValue(h, "gf-category", "__new");
  const box = doc.querySelector(".gf-newcat");
  assert.equal(box.hidden, false, "aparece el nombre y el ícono");
  submit(h);
  assert.match(doc.querySelector(".gf-error").textContent, /nombre para la nueva categoría/);
  setValue(h, "gf-newcat-name", "Internet");
  [...box.querySelectorAll('input[name="icon"]')].find((r) => r.value === "📶").checked = true;
  submit(h);
  const cats = h.win.MPDDGastos.categories();
  assert.equal(cats.length, 1);
  eq([cats[0].label, cats[0].icon], ["Internet", "📶"]);
  const g = h.win.MPDDGastos.list()[0];
  assert.equal(g.category, cats[0].key);
  const card = cardOf(h, g.id);
  assert.match(text(card), /📶/);
  assert.match(text(card), /Internet/);
  // The new category is offered next time.
  doc.getElementById("gf-add").click();
  assert.ok([...doc.getElementById("gf-category").options].some((o) => o.value === cats[0].key && /Internet/.test(o.textContent)));
});

/* ---------------- 2. Totals and "pays this month" ---------------- */

test("total mensual por moneda (USD, COP, EUR) con conversión a mensual y «Este mes pagas»", async () => {
  const list = [
    gasto("a1", "Predial", { amount: 1200, frequency: "annual", day: 10, month: 11, category: "impuestos" }),
    gasto("a2", "Seguro", { amount: 600, frequency: "annual", day: 10, month: 3 }),
    gasto("m1", "Luz", { amount: 50000, currency: "COP", day: 20, category: "luz" }),
    gasto("q1", "Comunidad", { amount: 300, currency: "EUR", frequency: "quarterly", day: 5, month: 2 }),
    gasto("s1", "Jardín", { amount: 120, frequency: "semiannual", day: 2, month: 1 }),
  ];
  const h = open({ [KEY]: JSON.stringify(list) });
  await sleep(60);
  const sec = h.doc.getElementById("gastos-fijos");
  const monthly = [...sec.querySelectorAll(".gf-monthly .money-line")].map((n) => n.textContent);
  // 1200/12 + 600/12 + 120/6 = 100 + 50 + 20 = 170 USD; 50.000 COP; 300/3 = 100 EUR
  eq(monthly, ["US$170.00 USD", "$50.000 COP", "100,00 € EUR"], "orden USD, COP, EUR");
  assert.match(text(sec), /Los gastos trimestrales, semestrales y anuales se cuentan como su parte mensual\./);
  const due = [...sec.querySelectorAll(".gf-due-month .money-line")].map((n) => n.textContent);
  // November: Predial (annual, Nov) + Luz + Comunidad (Feb, May, Aug, Nov).
  eq(due, ["US$1,200.00 USD", "$50.000 COP", "300,00 € EUR"]);
  assert.ok(cardOf(h, "a1").querySelector(".gf-badge-month"), "anual de noviembre: «Se paga este mes»");
  assert.equal(cardOf(h, "a1").querySelector(".gf-badge-month").textContent, "Se paga este mes");
  assert.ok(!cardOf(h, "a2").querySelector(".gf-badge-month"), "anual de marzo: sin insignia");
  assert.ok(!cardOf(h, "m1").querySelector(".gf-badge-month"), "mensual: sin insignia");
  assert.match(text(cardOf(h, "a1")), /Equivale a US\$100\.00 USD al mes/);
  assert.match(text(cardOf(h, "q1")), /Trimestral/);
});

test("solo mensuales: no se muestra la nota ni «Este mes pagas»", async () => {
  const h = open({ [KEY]: JSON.stringify([gasto("m1", "Agua", { amount: 40 })]) });
  await sleep(60);
  const sec = h.doc.getElementById("gastos-fijos");
  assert.ok(!sec.querySelector(".gf-thismonth"));
  assert.ok(!sec.querySelector(".gf-note"));
  eq([...sec.querySelectorAll(".gf-monthly .money-line")].map((n) => n.textContent), ["US$40.00 USD"]);
});

/* ---------------- 3. Highlight colors and labels ---------------- */

test("resaltado: rojo hoy y vencido, amarillo mañana, azul en 3 días, nada a 8+ días ni pagado", async () => {
  const list = [
    gasto("hoy", "Hoy", { day: 18 }),
    gasto("venc", "Vencido", { day: 15 }),
    gasto("man", "Mañana", { day: 19 }),
    gasto("tres", "Tres", { day: 21 }),
    gasto("ocho", "Ocho", { day: 26 }),
    gasto("pag", "Pagado", { day: 18, payments: [{ period: "2026-11", date: "2026-11-17", amount: 100 }] }),
  ];
  const h = open({ [KEY]: JSON.stringify(list) });
  await sleep(60);
  const level = (id) => ["red", "yellow", "blue"].find((c) => cardOf(h, id).classList.contains("gf-" + c)) || null;
  const label = (id) => text(cardOf(h, id).querySelector(".gf-due"));
  assert.equal(level("hoy"), "red");
  assert.equal(label("hoy"), "Vence hoy");
  assert.equal(level("venc"), "red");
  assert.equal(label("venc"), "Vencido");
  assert.equal(level("man"), "yellow");
  assert.equal(label("man"), "Vence mañana");
  assert.equal(level("tres"), "blue");
  assert.equal(label("tres"), "Vence en 3 días");
  assert.equal(level("ocho"), null);
  assert.equal(cardOf(h, "ocho").querySelector(".gf-due"), null);
  assert.equal(level("pag"), null);
  assert.equal(text(cardOf(h, "pag").querySelector(".gf-paid-chip")), "Pagado");
  // Color always with text, and in the order of the next payment.
  const order = [...h.doc.querySelectorAll("#gastos-fijos .gf-card")].map((c) => c.dataset.gastoId);
  eq(order.slice(0, 4), ["venc", "hoy", "man", "tres"]);
});

test("resaltado en inglés", async () => {
  const list = [gasto("hoy", "Hoy", { day: 18 }), gasto("tres", "Tres", { day: 21 })];
  const h = load({ storage: { "deudas-lang-v1": "en", [KEY]: JSON.stringify(list) }, beforeParse: clock });
  await sleep(80);
  assert.equal(h.doc.querySelector("#gastos-fijos h2").textContent, "Fixed expenses");
  assert.equal(text(cardOf(h, "hoy").querySelector(".gf-due")), "Due today");
  assert.equal(text(cardOf(h, "tres").querySelector(".gf-due")), "Due in 3 days");
  assert.match(text(cardOf(h, "hoy")), /Next payment:/);
  assert.match(text(cardOf(h, "hoy")), /Record payment/);
});

test("registrar pago marca el período actual; «Deshacer» lo quita", async () => {
  const h = open({ [KEY]: JSON.stringify([gasto("hoy", "Internet", { day: 18, amount: 70 })]) });
  await sleep(60);
  const pay = cardOf(h, "hoy").querySelector(".gf-pay");
  assert.equal(pay.textContent, "Registrar pago");
  pay.click();
  let g = h.win.MPDDGastos.get("hoy");
  eq(g.payments, [{ period: "2026-11", date: "2026-11-18", amount: 70 }]);
  let card = cardOf(h, "hoy");
  assert.equal(text(card.querySelector(".gf-paid-chip")), "Pagado");
  assert.ok(!card.classList.contains("gf-red"), "pagado: sin resaltado");
  assert.ok(!card.querySelector(".gf-pay"), "no se vuelve a pagar");
  assert.match(text(card), /Próximo pago: 18 de diciembre de 2026/);
  card.querySelector(".gf-undo").click();
  g = h.win.MPDDGastos.get("hoy");
  eq(g.payments, []);
  card = cardOf(h, "hoy");
  assert.ok(card.classList.contains("gf-red"));
  assert.ok(card.querySelector(".gf-pay"));
});

test("recuperación pendiente: los botones de gastos fijos quedan desactivados", async () => {
  const h = open({ [KEY]: JSON.stringify([gasto("g1", "Agua")]), "nando-restore-journal-v1": "{corrupto" });
  await sleep(60);
  assert.equal(h.doc.getElementById("gf-add").disabled, true);
  assert.equal(cardOf(h, "g1").querySelector(".gf-pay").disabled, true);
  assert.equal(cardOf(h, "g1").querySelector(".gf-edit").disabled, true);
});

/* ---------------- 4. Calendar, badge, reminders ---------------- */

test("calendario: marcas del día, Próximos pagos, totales del mes y marcar pagado desde el detalle", async () => {
  const list = [gasto("luz", "Luz", { day: 20, amount: 80, category: "luz" }), gasto("pre", "Predial", { amount: 1200, frequency: "annual", day: 25, month: 11, category: "impuestos" }), gasto("jun", "Seguro", { amount: 500, frequency: "annual", day: 20, month: 6 })];
  const h = open({ [KEY]: JSON.stringify(list), "nando-deudas-v1": JSON.stringify([debt("d1", "Tarjeta", { due: "20", minPayment: 30, createdAt: "2026-11-01" })]) });
  await sleep(80);
  const view = h.doc.getElementById("view-calendar");
  const toPay = [...view.querySelectorAll(".cal-sum")[0].querySelectorAll(".money-line")].map((n) => n.textContent);
  eq(toPay, ["US$1,310.00 USD"], "cuota 30 + luz 80 + predial completo 1.200 (el seguro de junio no)");
  const cell20 = view.querySelector('.cal-day[data-date="2026-11-20"]');
  assert.equal(cell20.dataset.state, "pending");
  assert.equal(text(cell20.querySelector(".cal-count")), "2", "deuda y gasto el mismo día");
  assert.ok(view.querySelector('.cal-day[data-date="2026-11-25"] .dot'));
  const rows = [...view.querySelectorAll(".upcoming-row")];
  const luzRow = rows.find((r) => r.dataset.gastoId === "luz");
  assert.ok(luzRow, "aparece en Próximos pagos");
  assert.match(text(luzRow), /💡/);
  assert.match(text(luzRow), /Gasto fijo/);
  assert.ok(!rows.some((r) => r.dataset.gastoId === "jun"));
  // Day detail: mark it paid.
  cell20.click();
  const detail = view.querySelector(".cal-detail");
  const btn = detail.querySelector('button[data-gasto-id="luz"]');
  assert.equal(btn.textContent, "Marcar como pagado");
  btn.click();
  await sleep(20);
  assert.equal(h.win.MPDDGastos.get("luz").payments[0].period, "2026-11");
  const paid = [...view.querySelectorAll(".cal-sum")[1].querySelectorAll(".money-line")].map((n) => n.textContent);
  eq(paid, ["US$80.00 USD"]);
  const after = [...view.querySelectorAll(".cal-sum")[0].querySelectorAll(".money-line")].map((n) => n.textContent);
  eq(after, ["US$1,230.00 USD"]);
  assert.ok(!cardOf(h, "luz").querySelector(".gf-pay"), "Inicio también lo ve pagado");
  // Undo from the calendar too.
  view.querySelector('.cal-detail button[data-gasto-id="luz"]').click();
  eq(h.win.MPDDGastos.get("luz").payments, []);
  eq(h.errors, []);
});

test("contador de Inicio y avisos de hoy incluyen los gastos fijos", async () => {
  const list = [gasto("hoy", "Agua", { day: 18 }), gasto("tres", "Gas", { day: 21 }), gasto("lejos", "Luz", { day: 28 })];
  const h = open({ [KEY]: JSON.stringify(list) });
  await sleep(80);
  const badge = h.doc.querySelector('.bottom-nav [data-target="home"] .nav-badge');
  assert.ok(badge, "hay contador");
  assert.equal(badge.textContent, "2", "hoy + en 3 días (anticipación por defecto 3)");
  const C = h.win.MPDDGastosCore;
  const ev = C.reminders(h.win.MPDDGastos.list(), { today: "2026-11-18", daysBefore: 3 });
  eq(ev.map((e) => [e.gastoId, e.offsetDays]), [["hoy", 0], ["tres", 3]]);
  assert.equal(C.reminderMessage(ev[1], "es"), "Gas: gasto fijo vence en 3 días.");
  assert.equal(C.reminderMessage(ev[0], "en"), "Agua: fixed expense due today.");
  const today = h.doc.querySelector(".legacy-reminders");
  assert.match(text(today), /Agua: gasto fijo vence hoy\./);
  h.win.MPDDGastos.markPaid("hoy", "2026-11");
  await sleep(20);
  assert.equal(h.doc.querySelector('.bottom-nav [data-target="home"] .nav-badge').textContent, "1");
});

/* ---------------- 5. Calendar file (.ics) ---------------- */

test(".ics: gastos trimestrales y anuales con su RRULE, días 29–31 y alarma del día antes", () => {
  const gastos = [
    gasto("q1", "Comunidad", { frequency: "quarterly", day: 31, month: 2, amount: 300, currency: "EUR" }),
    gasto("a1", "Predial", { frequency: "annual", day: 10, month: 3, amount: 1200 }),
    gasto("m1", "Agua", { frequency: "monthly", day: 30, amount: 40 }),
    gasto("s1", "Jardín", { frequency: "semiannual", day: 5, month: 12, amount: 90 }),
    { id: "x", deleted: true, updatedAt: "2026-11-01T00:00:00Z" },
  ];
  const { text: ics, count } = Push.buildICS([], { today: "2026-11-18", now: new Date("2026-11-18T12:00:00Z"), gastos, format: (a, c) => a + " " + c });
  assert.equal(count, 4);
  const ev = ics.split("BEGIN:VEVENT").slice(1);
  const of = (name) => ev.find((e) => e.includes("SUMMARY:Gasto fijo: " + name));
  assert.match(of("Comunidad"), /RRULE:FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=-1\r\n/);
  assert.match(of("Comunidad"), /DTSTART;VALUE=DATE:20261130\r\n/, "nov. tiene 30 días: el último día");
  assert.match(of("Predial"), /RRULE:FREQ=MONTHLY;INTERVAL=12;BYMONTHDAY=10\r\n/);
  assert.match(of("Predial"), /DTSTART;VALUE=DATE:20270310\r\n/);
  assert.match(of("Agua"), /RRULE:FREQ=MONTHLY;INTERVAL=1;BYMONTHDAY=28\\?,29\\?,30;BYSETPOS=-1\r\n/);
  assert.match(of("Agua"), /DTSTART;VALUE=DATE:20261130\r\n/);
  assert.match(of("Jardín"), /RRULE:FREQ=MONTHLY;INTERVAL=6;BYMONTHDAY=5\r\n/);
  assert.match(of("Jardín"), /DTSTART;VALUE=DATE:20261205\r\n/);
  for (const e of ev) {
    assert.match(e, /TRIGGER:-P1D\r\n/);
    assert.match(e, /UID:gasto-[A-Za-z0-9_-]+@mi-plan-de-deudas\r\n/);
  }
  assert.match(of("Predial"), /DESCRIPTION:Monto: 1200 USD\\nFrecuencia: Anual/);
});

test("botón del calendario (.ics) incluye los gastos fijos del dispositivo", async () => {
  const h = open({ [KEY]: JSON.stringify([gasto("a1", "Predial", { frequency: "annual", day: 10, month: 3 })]) });
  await sleep(80);
  h.doc.getElementById("ics-download").click();
  assert.match(h.win.MPDDLastICS, /SUMMARY:Gasto fijo: Predial\r\n/);
  assert.match(h.win.MPDDLastICS, /RRULE:FREQ=MONTHLY;INTERVAL=12;BYMONTHDAY=10\r\n/);
});

/* ---------------- 6. Backups ---------------- */

test("respaldo con gastos fijos y categorías: se descarga y se restaura en otro dispositivo", async () => {
  const cats = [{ key: "c-abc123", label: "Internet", icon: "📶" }];
  const a = open({ [KEY]: JSON.stringify([gasto("g1", "Fibra", { category: "c-abc123" }), { id: "g0", deleted: true, updatedAt: "2026-11-02T00:00:00.000Z" }]), [CATS]: JSON.stringify(cats) });
  await sleep(60);
  const raw = a.win.DebtBackupPlus.create(a.win.localStorage, []);
  const data = JSON.parse(raw);
  assert.equal(data.version, 2);
  assert.equal(data.gastosFijos.length, 2, "incluye la marca de borrado");
  eq(data.gastosCategorias, cats);

  const b = open({ [KEY]: JSON.stringify([gasto("otro", "Otro")]) });
  await sleep(60);
  const P = b.win.DebtBackupPlus;
  const v = P.validate(raw);
  assert.equal(v.gastos.length, 2);
  const r = P.restore(b.win.localStorage, raw, P.snapshotState(b.win.localStorage), false, () => require("crypto").randomUUID());
  assert.equal(r.gastosRestored, true);
  await sleep(20);
  eq(b.win.MPDDGastos.list().map((g) => g.name), ["Fibra"]);
  eq(b.win.MPDDGastos.categories(), cats);
  assert.ok(cardOf(b, "g1"), "Inicio se actualiza");
  assert.match(text(cardOf(b, "g1")), /📶/);
  assert.equal(b.win.localStorage.getItem("nando-restore-journal-v1"), null);
});

test("respaldo: gastos inválidos se descartan; respaldos viejos sin gastos restauran bien", async () => {
  const h = open({ [KEY]: JSON.stringify([gasto("mio", "Mío")]) });
  await sleep(60);
  const P = h.win.DebtBackupPlus;
  const id = () => require("crypto").randomUUID();
  // With an invalid expense mixed in: only valid ones are kept.
  const mixed = JSON.stringify({ version: 2, debts: [], preferences: {}, gastosFijos: [gasto("ok", "Bueno"), { id: "bad", name: "", amount: -1 }] });
  eq(P.validate(mixed).gastos.map((g) => g.id), ["ok"]);
  assert.throws(() => P.validate(JSON.stringify({ version: 2, debts: [], preferences: {}, gastosFijos: "x" })), /gastos fijos/);
  // Old v2 backup without expenses: debts restored, this device's expenses untouched.
  const old = JSON.stringify({ version: 2, debts: [debt("d1", "Tarjeta")], preferences: {} });
  const r = P.restore(h.win.localStorage, old, P.snapshotState(h.win.localStorage), false, id);
  assert.equal(r.count, 1);
  assert.equal(r.gastosRestored, false);
  eq(h.win.MPDDGastos.list().map((g) => g.id), ["mio"]);
  // Version 1 backup.
  const v1 = JSON.stringify({ version: 1, debts: [debt("d2", "Préstamo")] });
  P.restore(h.win.localStorage, v1, P.snapshotState(h.win.localStorage), false, id);
  eq(h.debts().map((d) => d.id), ["d2"]);
  eq(h.win.MPDDGastos.list().map((g) => g.id), ["mio"]);
});

/* ---------------- 7. Sync with the account ---------------- */

async function signedIn(server, uid, storage = {}) {
  const h = open(Object.assign({ "mpdd-cloud-active-v1": "1", "sb-fake-auth-token": session("a@ejemplo.test", uid) }, storage), { config: "test", server });
  await waitFor(() => ["needsChoice", "synced"].includes(h.win.MPDDCloud.status().state), { label: "inicio de sesión" });
  if (h.win.MPDDCloud.status().state === "needsChoice") {
    await h.win.MPDDCloud.resolveLink("merge");
    await waitFor(() => h.win.MPDDCloud.status().state === "synced", { label: "vinculación" });
  }
  return h;
}
const rows = (server, uid) => [...(server.gastos.get(uid) || new Map()).values()];

test("sincronización: local → nube, nube → otro dispositivo, borrado propagado y sin duplicados", async () => {
  const server = new FakeServer();
  const uid = server.addUser("a@ejemplo.test", "secreta123");
  const a = await signedIn(server, uid, { [KEY]: JSON.stringify([gasto("g1", "Agua", { day: 5 })]) });
  await waitFor(() => rows(server, uid).length === 1, { label: "subida inicial" });
  const r = rows(server, uid)[0];
  eq([r.id, r.nombre, r.monto, r.moneda, r.frecuencia, r.dia, r.mes, r.user_id, r.borrado], ["g1", "Agua", 100, "USD", "mensual", 5, null, uid, null]);
  const upserts = server.calls.filter((c) => c[0] === "table" && c[1] === "gastos_fijos" && c[2] === "upsert");
  eq(upserts[0][3], { onConflict: "user_id,id" });

  // A new expense on device A is sent by itself (debounced), without "Sincronizar ahora".
  a.win.MPDDGastos.save({ name: "Predial", amount: 1200, currency: "USD", frequency: "annual", day: 10, month: 3 });
  await waitFor(() => rows(server, uid).length === 2, { label: "subida automática", timeout: 5000 });
  assert.ok(rows(server, uid).some((x) => x.nombre === "Predial" && x.frecuencia === "anual" && x.mes === 3));

  // Device B (same account) receives both.
  const b = await signedIn(server, uid);
  await waitFor(() => b.win.MPDDGastos.list().length === 2, { label: "bajada" });
  assert.ok(cardOf(b, "g1"), "se muestran en Inicio");

  // Payment on B reaches A.
  b.win.MPDDGastos.markPaid("g1", "2026-12");
  await waitFor(() => (rows(server, uid).find((x) => x.id === "g1").pagos || []).length === 1, { label: "pago subido", timeout: 5000 });
  await a.win.MPDDCloud.syncNow();
  await waitFor(() => a.win.MPDDGastos.get("g1").payments.length === 1, { label: "pago bajado" });

  // Deletion on A reaches B.
  a.win.MPDDGastos.remove("g1");
  await waitFor(() => rows(server, uid).find((x) => x.id === "g1").borrado, { label: "borrado subido", timeout: 5000 });
  await b.win.MPDDCloud.syncNow();
  await waitFor(() => !b.win.MPDDGastos.get("g1"), { label: "borrado bajado" });
  assert.ok(b.win.MPDDGastos.all().some((g) => g.id === "g1" && g.deleted), "queda la marca");

  // Several syncs: no duplicates anywhere.
  await b.win.MPDDCloud.syncNow();
  await a.win.MPDDCloud.syncNow();
  assert.equal(rows(server, uid).length, 2);
  assert.equal(a.win.MPDDGastos.all().length, 2);
  assert.equal(b.win.MPDDGastos.all().length, 2);
  eq(a.errors.concat(b.errors), []);
});

test("sincronización: gana el cambio más reciente (por updatedAt) en cada lado", async () => {
  const server = new FakeServer();
  const uid = server.addUser("a@ejemplo.test", "secreta123");
  const GC = require("../dist/gastos-core.js");
  const remoteNewer = Object.assign(GC.toRow(gasto("r1", "Remoto nuevo", { updatedAt: "2026-11-12T10:00:00.000Z" })), { user_id: uid });
  const remoteOlder = Object.assign(GC.toRow(gasto("l1", "Remoto viejo", { updatedAt: "2026-11-05T10:00:00.000Z" })), { user_id: uid });
  server.gastos.set(uid, new Map([["r1", remoteNewer], ["l1", remoteOlder]]));
  const local = [gasto("r1", "Local viejo", { updatedAt: "2026-11-10T10:00:00.000Z" }), gasto("l1", "Local nuevo", { updatedAt: "2026-11-15T10:00:00.000Z" })];
  const h = await signedIn(server, uid, { [KEY]: JSON.stringify(local) });
  await waitFor(() => rows(server, uid).find((x) => x.id === "l1").nombre === "Local nuevo", { label: "local más nuevo sube" });
  await waitFor(() => h.win.MPDDGastos.get("r1").name === "Remoto nuevo", { label: "remoto más nuevo baja" });
  assert.equal(rows(server, uid).find((x) => x.id === "r1").nombre, "Remoto nuevo");
  assert.equal(rows(server, uid).length, 2);
});

test("sin conexión: queda en el dispositivo y se envía al volver la conexión", async () => {
  const server = new FakeServer();
  const uid = server.addUser("a@ejemplo.test", "secreta123");
  const h = await signedIn(server, uid);
  server.offline = true;
  h.setOnline(false);
  h.win.MPDDGastos.save({ name: "Gas", amount: 30, currency: "USD", frequency: "monthly", day: 3 });
  await sleep(1500);
  assert.equal(rows(server, uid).length, 0);
  assert.equal(h.win.MPDDGastos.list().length, 1, "guardado en el dispositivo");
  server.offline = false;
  h.setOnline(true);
  await waitFor(() => rows(server, uid).length === 1, { label: "enviado al volver", timeout: 5000 });
  eq(h.errors, []);
});

test("eliminar cuenta borra los gastos fijos de la nube; cerrar sesión borrando datos limpia el dispositivo", async () => {
  const server = new FakeServer();
  const uid = server.addUser("a@ejemplo.test", "secreta123");
  const h = await signedIn(server, uid, { [KEY]: JSON.stringify([gasto("g1", "Agua")]), [CATS]: JSON.stringify([{ key: "c-abc", label: "Casa", icon: "🏠" }]) });
  await waitFor(() => rows(server, uid).length === 1, { label: "subida" });
  const r = await h.win.MPDDCloud.deleteAccount();
  assert.equal(r.ok, true);
  assert.equal(rows(server, uid).length, 0, "sin filas en gastos_fijos");

  const server2 = new FakeServer();
  const uid2 = server2.addUser("a@ejemplo.test", "secreta123");
  const d = await signedIn(server2, uid2, { [KEY]: JSON.stringify([gasto("g2", "Luz")]), [CATS]: JSON.stringify([{ key: "c-abc", label: "Casa", icon: "🏠" }]) });
  const out = await d.win.MPDDCloud.signOut({ keepLocal: false, reload: false });
  assert.equal(out.wiped, true);
  assert.equal(d.win.localStorage.getItem(KEY), null);
  assert.equal(d.win.localStorage.getItem(CATS), null);
});

test("sin sesión: los gastos fijos quedan solo en el dispositivo (sin red)", async () => {
  const server = new FakeServer();
  const h = open({}, { config: "test", server });
  await sleep(80);
  h.doc.getElementById("gf-add").click();
  setValue(h, "gf-name", "Cámaras");
  setValue(h, "gf-amount", "25");
  setValue(h, "gf-day", "1");
  setValue(h, "gf-category", "camaras");
  submit(h);
  await sleep(1500);
  assert.equal(h.win.MPDDGastos.list().length, 1);
  assert.equal(server.gastos.size, 0);
  assert.ok(!server.calls.some((c) => c[0] === "table" && c[1] === "gastos_fijos"), "ninguna llamada a gastos_fijos");
  assert.equal(h.net.createClient, 0, "ni siquiera se carga Supabase");
  eq(h.errors, []);
});
